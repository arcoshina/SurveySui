/// Placeholder objects for unified `claim` when only Pass or only NFT is used.
/// Move requires all object parameters in the PTB; `use_pass` / `use_nft` flags
/// tell `survey_vault::claim` which inputs to validate.
module surveysui::claim_sentinel;

use sui::object::{Self, UID};
use sui::transfer;
use sui::tx_context::TxContext;

public struct VoidNft has key {
    id: UID,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(VoidNft {
        id: object::new(ctx),
    });
}

#[test_only]
public fun void_nft_for_testing(ctx: &mut TxContext): VoidNft {
    VoidNft {
        id: object::new(ctx),
    }
}

#[test_only]
public fun delete_void_nft_for_testing(nft: VoidNft) {
    let VoidNft { id } = nft;
    object::delete(id);
}
