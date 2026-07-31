import hashlib

from counsel_giver_test_support import (
    client,
    exercises,
    game,
    new_profile,
    seed_activity,
    seed_adverse_wellness,
    write_fresh_sync,
)

from app import quests


def ok(label, condition):
    assert condition, f"COUNSEL BASELINE FAIL: {label}"
    print(f"  ok  {label}")


def board(mode, giver):
    new_profile(f"baseline-{mode}-{giver}", mode)
    write_fresh_sync()
    response = client.get(f"/api/offers/{giver}")
    assert response.status_code == 200
    return response


def offer_contract(offer):
    return (
        offer["kind"],
        offer.get("modality"),
        offer.get("target_minutes"),
        offer.get("total_sets"),
        offer["intensity"],
        offer["xp"],
        offer["gold"],
        offer["vigor"],
        offer["tier_label"],
    )


EXPECTED_BOARD_BYTES = {
    ("considered", "endurance"): (830, "92475b105daca00eaae0dbd61f8f67bb2ae3d0b75742656b7a25e53847e2e61e"),
    ("considered", "strength"): (1539, "36158fc010f0d81a9d93e7438c7817b8caad6411426026c199c47ac53ccdf69d"),
    ("considered", "recovery"): (828, "8b3e0ab44aea78232c6842c219e1cda557f2be7181d5edcb3c0c5e95f5bea108"),
    ("self", "endurance"): (2354, "a851ea594a6cf094f4a2753f8a85711ceb88c69c5a6c97a98b3f2f9161e50a08"),
    ("self", "strength"): (4436, "782795cbef88d0281e0a7a054b8751b660837863e87509eece820c38822b22c3"),
    ("self", "recovery"): (2461, "d6b33768b4df1f9002fcfefcab01644814af636ce2a4e34da4d35bac625590bb"),
}


def live_boards_are_byte_stable():
    # Given: a fresh, synced profile in each player-controlled Council mode.
    # When: every offerable giver board is serialized. Then: the live response
    # bytes remain exactly the v0.30.1 baseline across the dead-code removal.
    observed = {}
    for mode in ("considered", "self"):
        for giver in game.OFFERABLE_GIVERS:
            content = board(mode, giver).content
            observed[(mode, giver)] = (len(content), hashlib.sha256(content).hexdigest())
    ok("live giver boards remain byte-identical", observed == EXPECTED_BOARD_BYTES)


def endurance_roads_keep_concrete_offers():
    # Given: one practiced session on each live Fenn road. When: Choose-your-own
    # is read. Then: each road keeps its exact tier shapes and rewards.
    expected = {
        "run": (
            ("run_easy", "run", 15, None, "low", 33, 14, 2, "easy"),
            ("run_steady", "run", 20, None, "moderate", 59, 26, 2, "steady"),
            ("run_tempo", "run", 25, None, "hard", 93, 41, 3, "quality"),
        ),
        "ride": (
            ("ride_easy", "ride", 35, None, "low", 77, 34, 2, "easy"),
            ("ride_steady", "ride", 45, None, "moderate", 133, 59, 2, "steady"),
            ("ride_hills", "ride", 40, None, "hard", 149, 67, 3, "quality"),
        ),
        "swim": (
            ("swim_easy", "swim", 15, None, "low", 33, 14, 2, "easy"),
            ("swim_steady", "swim", 20, None, "moderate", 59, 26, 2, "steady"),
            ("swim_intervals", "swim", 28, None, "hard", 104, 46, 3, "quality"),
        ),
        "climb": (
            ("climb_technique", "climb", 40, None, "low", 88, 39, 2, "technique"),
            ("climb_volume", "climb", 60, None, "moderate", 178, 80, 2, "volume"),
            ("climb_session", "climb", 65, None, "hard", 243, 109, 3, "limit-session"),
        ),
    }
    for modality, activity_type, minutes in (
        ("run", "Run", 40),
        ("ride", "Ride", 50),
        ("swim", "Swim", 30),
        ("climb", "RockClimbing", 60),
    ):
        new_profile(f"baseline-{modality}", "self")
        write_fresh_sync()
        seed_activity(activity_type, 2, minutes)
        response = client.get("/api/offers/endurance")
        assert response.status_code == 200
        contracts = tuple(offer_contract(offer) for offer in response.json()["offers"])
        ok(f"Fenn retains characterized {modality} offers", contracts == expected[modality])


def strength_keeps_concrete_routines():
    # Given: a fresh Strength profile. When: Grunhilda's live Council path is
    # read. Then: its kettlebell routines, tiers, and rewards remain concrete.
    offers = board("self", "strength").json()["offers"]
    ok(
        "Grunhilda retains characterized routines and rewards",
        tuple(offer_contract(offer) for offer in offers)
        == (
            ("lift_volume", None, None, 12, "moderate", 106, 47, 2, "volume"),
            ("lift_circuit", None, None, 12, "moderate", 106, 47, 2, "circuit"),
            ("lift_strength", None, None, 16, "hard", 179, 80, 3, "strength"),
        ),
    )
    expected_names = (
        "Kettlebell Swing",
        "Goblet Squat",
        "Kettlebell Clean & Press",
        "Kettlebell Snatch",
    )
    ok(
        "Grunhilda retains characterized live exercise selection",
        all(tuple(row["exercise"] for row in offer["routine"]) == expected_names for offer in offers)
        and {
            exercises.EXERCISES[row["exercise"]]["equipment"]
            for offer in offers
            for row in offer["routine"]
        }
        == {"kettlebell"},
    )


def recovery_keeps_mobility_and_rest_writ():
    # Given: ordinary and adverse-wellness profiles. When: Elowen is read.
    # Then: both the live legacy mobility generator and Rest Writ survive.
    mobility = board("self", "recovery").json()["offers"]
    ok(
        "Elowen retains characterized mobility offers",
        tuple(offer_contract(offer) for offer in mobility)
        == (
            ("mobility", None, 15, None, "low", 33, 14, 2, "restore"),
            ("mobility", None, 20, None, "low", 44, 19, 2, "move"),
            ("mobility", None, 30, None, "low", 66, 29, 2, "unwind"),
        ),
    )
    new_profile("baseline-rest-writ", "considered")
    seed_adverse_wellness()
    writ = client.get("/api/offers/recovery").json()["offers"]
    ok(
        "Elowen retains the characterized Rest Writ",
        len(writ) == 1
        and offer_contract(writ[0])
        == ("rest", None, None, None, "low", 45, 20, 2, "rest-writ"),
    )


def dead_legacy_symbols_are_absent():
    # Given: the live Council characterization above. When: the quest module is
    # inspected. Then: no test-only legacy offer entry point remains.
    removed = (
        "get_offers",
        "accept_offer",
        "gen_lift_offers",
        "gen_endurance_offers",
        "gen_climb_offers",
    )
    ok("legacy offer entry points are removed", all(not hasattr(quests, name) for name in removed))


live_boards_are_byte_stable()
endurance_roads_keep_concrete_offers()
strength_keeps_concrete_routines()
recovery_keeps_mobility_and_rest_writ()
dead_legacy_symbols_are_absent()

print("COUNSEL BASELINE PASSED")
