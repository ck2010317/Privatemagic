use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");

// Seeds
pub const GAME_SEED: &[u8] = b"poker_game";
pub const PLAYER_HAND_SEED: &[u8] = b"player_hand";
pub const BETTING_POOL_SEED: &[u8] = b"betting_pool";
pub const BET_SEED: &[u8] = b"bet";

// Constants
pub const MAX_COMMUNITY_CARDS: usize = 5;
pub const MAX_HAND_CARDS: usize = 2;
pub const DECK_SIZE: usize = 52;

#[ephemeral]
#[program]
pub mod privatepoker {
    use super::*;

    /// 1️⃣ Create a new poker game room
    pub fn create_game(ctx: Context<CreateGame>, game_id: u64, buy_in: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player1 = ctx.accounts.player1.key();

        game.game_id = game_id;
        game.player1 = Some(player1);
        game.player2 = None;
        game.buy_in = buy_in;
        game.pot = buy_in; // Player 1 deposits their buy-in
        game.phase = GamePhase::WaitingForPlayer;
        game.community_cards = [0u8; MAX_COMMUNITY_CARDS];
        game.community_card_count = 0;
        game.current_bet = 0;
        game.dealer = 0; // Player 1 is dealer
        game.turn = 1; // Player 2 acts first (small blind)
        game.winner = GameResult::None;
        game.deck_seed = game_id; // Used for deterministic shuffle in TEE

        // Initialize player 1's hand
        let hand = &mut ctx.accounts.player_hand;
        hand.game_id = game_id;
        hand.player = player1;
        hand.cards = [0u8; MAX_HAND_CARDS];
        hand.has_folded = false;
        hand.current_bet = 0;
        hand.total_bet = buy_in;
        hand.is_all_in = false;

        // Transfer buy-in SOL from player1 to game PDA
        let transfer_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.player1.to_account_info(),
            to: game.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_ix),
            buy_in,
        )?;

        msg!("Poker game {} created by {} with buy-in {} lamports", game_id, player1, buy_in);
        Ok(())
    }

    /// 2️⃣ Player 2 joins the game
    pub fn join_game(ctx: Context<JoinGame>, game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player = ctx.accounts.player.key();

        require!(game.player1 != Some(player), GameError::CannotJoinOwnGame);
        require!(game.player2.is_none(), GameError::GameFull);
        require!(game.phase == GamePhase::WaitingForPlayer, GameError::InvalidPhase);

        game.player2 = Some(player);
        game.pot += game.buy_in;
        game.phase = GamePhase::PreFlop;

        // Initialize player 2's hand
        let hand = &mut ctx.accounts.player_hand;
        hand.game_id = game_id;
        hand.player = player;
        hand.cards = [0u8; MAX_HAND_CARDS];
        hand.has_folded = false;
        hand.current_bet = 0;
        hand.total_bet = game.buy_in;
        hand.is_all_in = false;

        // Transfer buy-in SOL
        let transfer_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.player.to_account_info(),
            to: game.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_ix),
            game.buy_in,
        )?;

        msg!("{} joined poker game {} as player 2", player, game_id);
        Ok(())
    }

    /// 3️⃣ Deal cards (executed privately in TEE)
    pub fn deal_cards(
        ctx: Context<DealCards>,
        _game_id: u64,
        player1_cards: [u8; 2],
        player2_cards: [u8; 2],
        community_cards: [u8; 5],
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(
            game.phase == GamePhase::PreFlop,
            GameError::InvalidPhase
        );

        // Store community cards (hidden until revealed per phase)
        game.community_cards = community_cards;

        // Deal to player 1
        let hand1 = &mut ctx.accounts.player1_hand;
        hand1.cards = player1_cards;

        // Deal to player 2
        let hand2 = &mut ctx.accounts.player2_hand;
        hand2.cards = player2_cards;

        msg!("Cards dealt for game {}", game.game_id);
        Ok(())
    }

    /// 4️⃣ Player action: Check, Call, Raise, Fold, AllIn
    pub fn player_action(
        ctx: Context<PlayerAction>,
        _game_id: u64,
        action: Action,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let hand = &mut ctx.accounts.player_hand;
        let player = ctx.accounts.player.key();

        // Verify it's the player's turn
        let is_player1 = game.player1 == Some(player);
        let is_player2 = game.player2 == Some(player);
        require!(is_player1 || is_player2, GameError::NotInGame);

        let player_num = if is_player1 { 1 } else { 2 };
        require!(game.turn == player_num, GameError::NotYourTurn);
        require!(!hand.has_folded, GameError::AlreadyFolded);

        match action {
            Action::Fold => {
                hand.has_folded = true;
                // Other player wins
                if is_player1 {
                    game.winner = GameResult::Winner(game.player2.unwrap());
                } else {
                    game.winner = GameResult::Winner(game.player1.unwrap());
                }
                game.phase = GamePhase::Showdown;
            }
            Action::Check => {
                require!(game.current_bet == hand.current_bet, GameError::MustCallOrRaise);
                game.turn = if player_num == 1 { 2 } else { 1 };
            }
            Action::Call => {
                let call_amount = game.current_bet.saturating_sub(hand.current_bet);
                hand.current_bet = game.current_bet;
                hand.total_bet += call_amount;
                game.pot += call_amount;
                // After call, advance phase if both have acted
                game.turn = if player_num == 1 { 2 } else { 1 };
            }
            Action::Raise { amount } => {
                require!(amount > game.current_bet, GameError::RaiseTooSmall);
                let raise_diff = amount.saturating_sub(hand.current_bet);
                hand.current_bet = amount;
                hand.total_bet += raise_diff;
                game.current_bet = amount;
                game.pot += raise_diff;
                game.turn = if player_num == 1 { 2 } else { 1 };
            }
            Action::AllIn => {
                hand.is_all_in = true;
                hand.current_bet = game.current_bet;
                hand.total_bet += game.buy_in.saturating_sub(hand.total_bet);
                game.pot = game.buy_in * 2; // Both players all in
                game.turn = if player_num == 1 { 2 } else { 1 };
            }
        }

        msg!("Player {} action: {:?}", player, action);
        Ok(())
    }

    /// 5️⃣ Advance to next phase (Flop -> Turn -> River -> Showdown)
    pub fn advance_phase(ctx: Context<AdvancePhase>, _game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;

        match game.phase {
            GamePhase::PreFlop => {
                game.phase = GamePhase::Flop;
                game.community_card_count = 3;
            }
            GamePhase::Flop => {
                game.phase = GamePhase::Turn;
                game.community_card_count = 4;
            }
            GamePhase::Turn => {
                game.phase = GamePhase::River;
                game.community_card_count = 5;
            }
            GamePhase::River => {
                game.phase = GamePhase::Showdown;
            }
            _ => return Err(GameError::InvalidPhase.into()),
        }

        // Reset current bets for new round
        game.current_bet = 0;
        game.turn = if game.dealer == 0 { 2 } else { 1 };

        msg!("Game {} advanced to phase {:?}", game.game_id, game.phase);
        Ok(())
    }

    /// 6️⃣ Reveal winner and commit state back to Solana L1 via MagicBlock ER
    /// This instruction runs ON the Ephemeral Rollup and commits game result to base layer
    pub fn reveal_winner(ctx: Context<RevealWinner>, winner_index: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let _player1_hand = &ctx.accounts.player1_hand;
        let _player2_hand = &ctx.accounts.player2_hand;

        require!(game.phase == GamePhase::Showdown, GameError::InvalidPhase);

        // Determine winner
        match winner_index {
            0 => {
                game.winner = GameResult::Winner(game.player1.unwrap());
            }
            1 => {
                game.winner = GameResult::Winner(game.player2.unwrap());
            }
            _ => {
                game.winner = GameResult::Tie;
            }
        }

        game.phase = GamePhase::Settled;

        msg!("Winner revealed for game {}: {:?}", game.game_id, game.winner);

        // Serialize ALL accounts before commit+undelegate back to Solana L1
        // CRITICAL: exit() must be called on EVERY account passed to commit_and_undelegate_accounts
        // exit() serializes the Anchor account struct back into the underlying AccountInfo data buffer.
        // Without this, the ER validator sees stale data and the undelegation silently fails.
        game.exit(&crate::ID)?;
        ctx.accounts.player1_hand.exit(&crate::ID)?;
        ctx.accounts.player2_hand.exit(&crate::ID)?;
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![
                &ctx.accounts.game.to_account_info(),
                &ctx.accounts.player1_hand.to_account_info(),
                &ctx.accounts.player2_hand.to_account_info(),
            ],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }

    /// 6b️⃣ Settle pot on base layer (after undelegation completes)
    /// Transfers SOL from game PDA to winner on Solana L1
    pub fn settle_pot(ctx: Context<SettlePot>) -> Result<()> {
        let game = &mut ctx.accounts.game;

        require!(game.phase == GamePhase::Settled, GameError::InvalidPhase);
        require!(game.pot > 0, GameError::AlreadyClaimed); // Prevent double-claim

        // Verify the winner account matches the game's recorded winner
        let winner_key = ctx.accounts.winner.key();
        match &game.winner {
            GameResult::Winner(w) => require!(*w == winner_key, GameError::InvalidPlayer),
            _ => return Err(GameError::InvalidPlayer.into()),
        }

        // Transfer pot from game PDA to winner using lamport manipulation
        let pot = game.pot;
        game.pot = 0; // Zero out pot BEFORE transfer to prevent re-entrancy

        // Drop mutable borrow before lamport manipulation
        drop(game);

        **ctx.accounts.game.to_account_info().try_borrow_mut_lamports()? -= pot;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += pot;

        msg!("Pot of {} lamports settled to winner {}", pot, winner_key);
        Ok(())
    }

    /// 🏆 Settle game directly on L1 — sets winner + transfers pot in one call
    /// Winner gets the actual in-game pot, loser gets their remaining SOL back.
    /// actual_pot = total lamports bet during the hand (both players' bets combined)
    /// If actual_pot is 0, falls back to winner-take-all (full game.pot to winner).
    pub fn settle_game(ctx: Context<SettleGame>, winner_index: u8, actual_pot: u64) -> Result<()> {
        msg!("🏆 settle_game called (no payer signer requirement)");
        
        let game = &mut ctx.accounts.game;

        // Can only settle once
        require!(game.phase != GamePhase::Settled, GameError::AlreadySettled);
        // Must have both players
        require!(game.player1.is_some() && game.player2.is_some(), GameError::MissingOpponent);

        let player1 = game.player1.unwrap();
        let player2 = game.player2.unwrap();

        // NOTE: Caller verification removed - would require sysvar_instructions or other approach

        // Determine winner and loser
        let (winner_pubkey, loser_pubkey) = match winner_index {
            0 => (player1, player2),
            1 => (player2, player1),
            _ => return Err(GameError::InvalidPlayer.into()),
        };

        // Verify the winner and loser accounts match
        require!(ctx.accounts.winner.key() == winner_pubkey, GameError::InvalidPlayer);
        require!(ctx.accounts.loser.key() == loser_pubkey, GameError::InvalidPlayer);

        // Update game state
        game.winner = GameResult::Winner(winner_pubkey);
        game.phase = GamePhase::Settled;

        // Calculate amounts:
        // total_in_pda = all SOL held in the game PDA (buy_in * 2)
        // actual_pot = the real in-game pot from the server (bets both players made)
        // winner gets: actual_pot (capped at total_in_pda)
        // loser gets: total_in_pda - actual_pot (their remaining unbet SOL)
        let total_in_pda = game.pot; // This is buy_in * 2 from create+join
        let capped_pot = if actual_pot > 0 && actual_pot <= total_in_pda {
            actual_pot
        } else {
            total_in_pda // Fallback: winner takes all
        };
        let loser_refund = total_in_pda.saturating_sub(capped_pot);

        game.pot = 0;
        let game_id = game.game_id;

        // Drop mutable borrow before lamport manipulation
        drop(game);

        let game_info = ctx.accounts.game.to_account_info();

        // Transfer pot to winner
        if capped_pot > 0 {
            **game_info.try_borrow_mut_lamports()? -= capped_pot;
            **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += capped_pot;
        }

        // Refund remaining SOL to loser
        if loser_refund > 0 {
            **game_info.try_borrow_mut_lamports()? -= loser_refund;
            **ctx.accounts.loser.to_account_info().try_borrow_mut_lamports()? += loser_refund;
        }

        msg!("Game {} settled! {} lamports to winner {}, {} lamports refunded to loser {}", game_id, capped_pot, winner_pubkey, loser_refund, loser_pubkey);
        Ok(())
    }

    // =================== BETTING POOL ===================

    /// 7️⃣ Create a betting pool for a game
    pub fn create_betting_pool(ctx: Context<CreateBettingPool>, game_id: u64) -> Result<()> {
        let pool = &mut ctx.accounts.betting_pool;
        pool.game_id = game_id;
        pool.total_pool_player1 = 0;
        pool.total_pool_player2 = 0;
        pool.total_bettors = 0;
        pool.is_settled = false;
        pool.winning_player = 0;

        msg!("Betting pool created for game {}", game_id);
        Ok(())
    }

    /// 8️⃣ Place a bet on a player
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        game_id: u64,
        bet_on_player: u8, // 1 = player1, 2 = player2
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.betting_pool;
        let bet = &mut ctx.accounts.bet;

        require!(!pool.is_settled, GameError::BettingClosed);
        require!(bet_on_player == 1 || bet_on_player == 2, GameError::InvalidPlayer);
        require!(amount > 0, GameError::BetTooSmall);

        bet.game_id = game_id;
        bet.bettor = ctx.accounts.bettor.key();
        bet.bet_on_player = bet_on_player;
        bet.amount = amount;
        bet.is_claimed = false;

        if bet_on_player == 1 {
            pool.total_pool_player1 += amount;
        } else {
            pool.total_pool_player2 += amount;
        }
        pool.total_bettors += 1;

        // Transfer SOL from bettor to pool PDA
        let transfer_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.bettor.to_account_info(),
            to: pool.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_ix),
            amount,
        )?;

        msg!(
            "Bet placed: {} wagered {} lamports on player {}",
            ctx.accounts.bettor.key(),
            amount,
            bet_on_player
        );
        Ok(())
    }

    /// 9️⃣ Settle betting pool after game ends
    pub fn settle_betting_pool(
        ctx: Context<SettleBettingPool>,
        _game_id: u64,
        winning_player: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.betting_pool;

        require!(!pool.is_settled, GameError::AlreadySettled);

        pool.is_settled = true;
        pool.winning_player = winning_player;

        msg!("Betting pool settled. Winning player: {}", winning_player);
        Ok(())
    }

    /// 🔟 Claim winnings from betting pool
    pub fn claim_bet_winnings(ctx: Context<ClaimBetWinnings>, _game_id: u64) -> Result<()> {
        let pool = &ctx.accounts.betting_pool;
        let bet = &mut ctx.accounts.bet;

        require!(pool.is_settled, GameError::NotSettled);
        require!(!bet.is_claimed, GameError::AlreadyClaimed);
        require!(bet.bet_on_player == pool.winning_player, GameError::LostBet);

        // Calculate payout: proportional share of total pool
        let total_pool = pool.total_pool_player1 + pool.total_pool_player2;
        let winning_pool = if pool.winning_player == 1 {
            pool.total_pool_player1
        } else {
            pool.total_pool_player2
        };

        // Payout = (bet_amount / winning_pool) * total_pool
        let payout = (bet.amount as u128)
            .checked_mul(total_pool as u128)
            .unwrap()
            .checked_div(winning_pool as u128)
            .unwrap() as u64;

        bet.is_claimed = true;

        // Transfer SOL from pool to winner
        **ctx.accounts.betting_pool.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.bettor.to_account_info().try_borrow_mut_lamports()? += payout;

        msg!(
            "Bet claimed: {} receives {} lamports",
            ctx.accounts.bettor.key(),
            payout
        );
        Ok(())
    }

    // =================== FUND RECOVERY ===================

    /// Cancel a game that hasn't started yet — Player 1 gets full refund
    /// Can only be called when game is in WaitingForPlayer phase (no opponent joined)
    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player1_key = ctx.accounts.player1.key();

        require!(game.phase == GamePhase::WaitingForPlayer, GameError::InvalidPhase);
        require!(game.player1 == Some(player1_key), GameError::NotInGame);

        // Refund the buy-in SOL back to player 1
        let refund = game.pot;
        game.pot = 0;
        game.phase = GamePhase::Settled; // Mark as settled to prevent re-use

        // Drop mutable borrow before lamport manipulation
        drop(game);

        if refund > 0 {
            **ctx.accounts.game.to_account_info().try_borrow_mut_lamports()? -= refund;
            **ctx.accounts.player1.to_account_info().try_borrow_mut_lamports()? += refund;
        }

        msg!("Game cancelled. {} lamports refunded to {}", refund, player1_key);
        Ok(())
    }

    /// Refund a bet from a settled betting pool where the bettor lost
    /// Losing bettors get nothing back (this is by design — winner takes the pool)
    /// BUT if the pool was never settled (game abandoned), bettors can reclaim their SOL
    pub fn refund_bet(ctx: Context<RefundBet>, _game_id: u64) -> Result<()> {
        let pool = &ctx.accounts.betting_pool;
        let bet = &mut ctx.accounts.bet;

        // Can only refund if pool is NOT settled (game was abandoned)
        require!(!pool.is_settled, GameError::BettingClosed);
        require!(!bet.is_claimed, GameError::AlreadyClaimed);

        let refund = bet.amount;
        bet.is_claimed = true; // Mark as claimed to prevent double-refund

        // Transfer SOL back from pool PDA to bettor
        **ctx.accounts.betting_pool.to_account_info().try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.bettor.to_account_info().try_borrow_mut_lamports()? += refund;

        msg!("Bet refunded: {} receives {} lamports back", ctx.accounts.bettor.key(), refund);
        Ok(())
    }

    // =================== DELEGATION (MagicBlock Ephemeral Rollups) ===================

    /// Delegate a PDA to the TEE validator for Ephemeral Rollup processing
    /// Cards are encrypted and processed inside Intel TDX TEE
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = derive_seeds_from_account_type(&account_type);
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();

        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }
}

// =================== ACCOUNT TYPES ===================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Game { game_id: u64 },
    PlayerHand { game_id: u64, player: Pubkey },
    BettingPool { game_id: u64 },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Game { game_id } => {
            vec![GAME_SEED.to_vec(), game_id.to_le_bytes().to_vec()]
        }
        AccountType::PlayerHand { game_id, player } => {
            vec![
                PLAYER_HAND_SEED.to_vec(),
                game_id.to_le_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
        AccountType::BettingPool { game_id } => {
            vec![BETTING_POOL_SEED.to_vec(), game_id.to_le_bytes().to_vec()]
        }
    }
}

// =================== ACCOUNT STRUCTURES ===================

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(
        init_if_needed,
        payer = player1,
        space = 8 + Game::LEN,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        init_if_needed,
        payer = player1,
        space = 8 + PlayerHand::LEN,
        seeds = [PLAYER_HAND_SEED, &game_id.to_le_bytes(), player1.key().as_ref()],
        bump
    )]
    pub player_hand: Account<'info, PlayerHand>,

    #[account(mut)]
    pub player1: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerHand::LEN,
        seeds = [PLAYER_HAND_SEED, &game_id.to_le_bytes(), player.key().as_ref()],
        bump
    )]
    pub player_hand: Account<'info, PlayerHand>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct DealCards<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_HAND_SEED, &game_id.to_le_bytes(), game.player1.unwrap().as_ref()],
        bump
    )]
    pub player1_hand: Account<'info, PlayerHand>,

    #[account(
        mut,
        seeds = [PLAYER_HAND_SEED, &game_id.to_le_bytes(), game.player2.unwrap().as_ref()],
        bump
    )]
    pub player2_hand: Account<'info, PlayerHand>,

    #[account(mut)]
    pub dealer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct PlayerAction<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_HAND_SEED, &game_id.to_le_bytes(), player.key().as_ref()],
        bump
    )]
    pub player_hand: Account<'info, PlayerHand>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct AdvancePhase<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

/// RevealWinner runs ON the MagicBlock Ephemeral Rollup
/// The #[commit] macro injects magic_context and magic_program accounts
/// which are used to commit+undelegate state back to Solana L1
#[commit]
#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_HAND_SEED, &game.game_id.to_le_bytes(), game.player1.unwrap().as_ref()],
        bump
    )]
    pub player1_hand: Account<'info, PlayerHand>,

    #[account(
        mut,
        seeds = [PLAYER_HAND_SEED, &game.game_id.to_le_bytes(), game.player2.unwrap().as_ref()],
        bump
    )]
    pub player2_hand: Account<'info, PlayerHand>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

/// SettlePot runs on Solana base layer AFTER undelegation
/// Transfers SOL from game PDA to the winner
#[derive(Accounts)]
pub struct SettlePot<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,

    /// CHECK: Winner account to receive pot payout (verified against game.winner in handler)
    #[account(mut)]
    pub winner: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

/// CancelGame — Player 1 cancels a game before Player 2 joins
#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub player1: Signer<'info>,
}

/// RefundBet — Bettor reclaims SOL from an unsettled betting pool
#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct RefundBet<'info> {
    #[account(
        mut,
        seeds = [BETTING_POOL_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,

    #[account(
        mut,
        seeds = [BET_SEED, &game_id.to_le_bytes(), bettor.key().as_ref()],
        bump,
        constraint = bet.bettor == bettor.key()
    )]
    pub bet: Account<'info, Bet>,

    #[account(mut)]
    pub bettor: Signer<'info>,
}

/// SettleGame — one-shot settle from any phase on L1
/// Sets winner + transfers pot, refunds loser remainder
/// No signer required — the game PDA seed constraints guarantee integrity
#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,

    /// CHECK: Winner account to receive pot payout (verified against game state in handler)
    #[account(mut)]
    pub winner: AccountInfo<'info>,

    /// CHECK: Loser account to receive refund of unbet SOL (verified against game state in handler)
    #[account(mut)]
    pub loser: AccountInfo<'info>,
}

// Betting Pool Accounts

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateBettingPool<'info> {
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + BettingPool::LEN,
        seeds = [BETTING_POOL_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [BETTING_POOL_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Bet::LEN,
        seeds = [BET_SEED, &game_id.to_le_bytes(), bettor.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(mut)]
    pub bettor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct SettleBettingPool<'info> {
    #[account(
        mut,
        seeds = [BETTING_POOL_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct ClaimBetWinnings<'info> {
    #[account(
        mut,
        seeds = [BETTING_POOL_SEED, &game_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,

    #[account(
        mut,
        seeds = [BET_SEED, &game_id.to_le_bytes(), bettor.key().as_ref()],
        bump,
        constraint = bet.bettor == bettor.key()
    )]
    pub bet: Account<'info, Bet>,

    #[account(mut)]
    pub bettor: Signer<'info>,
}

/// Unified delegate PDA context - delegates account to MagicBlock TEE validator
#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Optional validator (TEE validator pubkey)
    pub validator: Option<AccountInfo<'info>>,
}

// =================== DATA STRUCTURES ===================

#[account]
pub struct Game {
    pub game_id: u64,
    pub player1: Option<Pubkey>,
    pub player2: Option<Pubkey>,
    pub buy_in: u64,
    pub pot: u64,
    pub phase: GamePhase,
    pub community_cards: [u8; MAX_COMMUNITY_CARDS],
    pub community_card_count: u8,
    pub current_bet: u64,
    pub dealer: u8,
    pub turn: u8,
    pub winner: GameResult,
    pub deck_seed: u64,
}

impl Game {
    pub const LEN: usize = 8     // game_id
        + (32 + 1) * 2           // player1, player2 (Option<Pubkey>)
        + 8                      // buy_in
        + 8                      // pot
        + 1                      // phase
        + MAX_COMMUNITY_CARDS    // community_cards
        + 1                      // community_card_count
        + 8                      // current_bet
        + 1                      // dealer
        + 1                      // turn
        + (1 + 32)               // winner
        + 8;                     // deck_seed
}

#[account]
pub struct PlayerHand {
    pub game_id: u64,
    pub player: Pubkey,
    pub cards: [u8; MAX_HAND_CARDS],
    pub has_folded: bool,
    pub current_bet: u64,
    pub total_bet: u64,
    pub is_all_in: bool,
}

impl PlayerHand {
    pub const LEN: usize = 8    // game_id
        + 32                     // player
        + MAX_HAND_CARDS         // cards
        + 1                      // has_folded
        + 8                      // current_bet
        + 8                      // total_bet
        + 1;                     // is_all_in
}

#[account]
pub struct BettingPool {
    pub game_id: u64,
    pub total_pool_player1: u64,
    pub total_pool_player2: u64,
    pub total_bettors: u32,
    pub is_settled: bool,
    pub winning_player: u8,
}

impl BettingPool {
    pub const LEN: usize = 8    // game_id
        + 8                      // total_pool_player1
        + 8                      // total_pool_player2
        + 4                      // total_bettors
        + 1                      // is_settled
        + 1;                     // winning_player
}

#[account]
pub struct Bet {
    pub game_id: u64,
    pub bettor: Pubkey,
    pub bet_on_player: u8,
    pub amount: u64,
    pub is_claimed: bool,
}

impl Bet {
    pub const LEN: usize = 8    // game_id
        + 32                     // bettor
        + 1                      // bet_on_player
        + 8                      // amount
        + 1;                     // is_claimed
}

// =================== ENUMS ===================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GamePhase {
    WaitingForPlayer,
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
    Settled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GameResult {
    Winner(Pubkey),
    Tie,
    None,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum Action {
    Fold,
    Check,
    Call,
    Raise { amount: u64 },
    AllIn,
}

#[error_code]
pub enum GameError {
    #[msg("You cannot join your own game.")]
    CannotJoinOwnGame,
    #[msg("Game is already full.")]
    GameFull,
    #[msg("Invalid game phase for this action.")]
    InvalidPhase,
    #[msg("You are not in this game.")]
    NotInGame,
    #[msg("It's not your turn.")]
    NotYourTurn,
    #[msg("You have already folded.")]
    AlreadyFolded,
    #[msg("You must call or raise.")]
    MustCallOrRaise,
    #[msg("Raise amount too small.")]
    RaiseTooSmall,
    #[msg("Betting is closed.")]
    BettingClosed,
    #[msg("Invalid player number.")]
    InvalidPlayer,
    #[msg("Bet amount too small.")]
    BetTooSmall,
    #[msg("Betting pool already settled.")]
    AlreadySettled,
    #[msg("Betting pool not settled yet.")]
    NotSettled,
    #[msg("Winnings already claimed.")]
    AlreadyClaimed,
    #[msg("You lost this bet.")]
    LostBet,
    #[msg("Missing opponent.")]
    MissingOpponent,
}

