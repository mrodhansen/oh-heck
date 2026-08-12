#!/usr/bin/env python3
"""Seed a few completed local games via the running API (SQLite demo)."""
from __future__ import annotations

import json
import random
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

BASE = "http://127.0.0.1:3000"


def req(opener, method: str, path: str, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with opener.open(request) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        raise SystemExit(f"{method} {path} -> {e.code} {raw}") from e


def bid_order_ids(game, round_number: int) -> list[str]:
    rnd = next(r for r in game["rounds"] if r["number"] == round_number)
    ids = rnd.get("bidOrderPlayerIds") or []
    if ids:
        return ids
    order = rnd.get("bidOrderSeats") or []
    by_seat = {p["seatIndex"]: p["id"] for p in game["players"]}
    return [by_seat[s] for s in order]


def forbidden_last(prior: int, hand: int):
    forbidden = hand - prior
    if forbidden < 0 or forbidden > hand:
        return None
    return forbidden


def gen_bids(order: list[str], hand: int, rng: random.Random):
    bids = []
    running = 0
    for i, pid in enumerate(order):
        last = i == len(order) - 1
        forbidden = forbidden_last(running, hand) if last else None
        weights = []
        choices = []
        for b in range(0, hand + 1):
            if b == forbidden:
                continue
            # Prefer 0–2; still allow higher bids on big hands
            w = 5 if b <= 2 else (3 if b <= 4 else 1)
            choices.append(b)
            weights.append(w)
        bid = rng.choices(choices, weights=weights, k=1)[0]
        bids.append({"playerId": pid, "bid": bid})
        running += bid
    return bids, forbidden_last(sum(b["bid"] for b in bids[:-1]), hand) is not None


def gen_tricks(order: list[str], hand: int, bid_by: dict[str, int], rng: random.Random):
    remaining = hand
    tricks: dict[str, int] = {}
    seq = list(order)
    rng.shuffle(seq)
    for i, pid in enumerate(seq):
        if i == len(seq) - 1:
            tricks[pid] = remaining
            break
        bid = bid_by[pid]
        if remaining > 0 and rng.random() < 0.48 and bid <= remaining:
            t = bid
        else:
            t = rng.randint(0, remaining)
        tricks[pid] = t
        remaining -= t
    return [{"playerId": pid, "tricksTaken": tricks[pid]} for pid in order]


def play_game(opener, names: list[str], title: str, seed: int, force_round: int | None):
    rng = random.Random(seed)
    game = req(opener, "POST", "/games", {"playerNames": names, "name": title})
    gid = game["id"]
    print(f"  created {title} ({gid[:8]}…) {names}")
    for n in range(1, 14):
        game = req(opener, "GET", f"/games/{gid}")
        rnd = next(r for r in game["rounds"] if r["number"] == n)
        order = bid_order_ids(game, n)
        hand = rnd["handSize"]
        bids, last_restricted = gen_bids(order, hand, rng)
        force_burn = force_round == n and last_restricted
        game = req(
            opener,
            "POST",
            f"/games/{gid}/rounds/{n}/bids",
            {"bids": bids, "forceBurn": force_burn},
        )
        bid_by = {b["playerId"]: b["bid"] for b in bids}
        tricks = gen_tricks(order, hand, bid_by, rng)
        game = req(
            opener,
            "POST",
            f"/games/{gid}/rounds/{n}/tricks",
            {"tricks": tricks},
        )
    standings = sorted(game["standings"], key=lambda s: s["place"])
    winner = standings[0]
    print(
        f"    done  winner={winner['playerName']} ({winner['total']})  "
        f"status={game['status']}"
    )
    return game


def main():
    guest = urllib.request.build_opener()
    print("Seeding demo games…")
    g1 = play_game(
        guest,
        ["Dad", "Mom", "Sam", "Riley"],
        "Friday kitchen table",
        seed=11,
        force_round=4,
    )
    g2 = play_game(
        guest,
        ["Dad", "Jordan", "Casey", "Morgan", "Quinn"],
        "Sunday night",
        seed=22,
        force_round=7,
    )
    g3 = play_game(
        guest,
        ["Alex", "Sam", "Pat"],
        "Tuesday trio",
        seed=33,
        force_round=None,
    )

    note = {
        "id": "00000000-0000-4000-8000-000000000001",
        "text": "Riley dealt the 1-card round sideways. Still counts.",
        "createdAt": "2026-08-08T01:12:00.000Z",
        "updatedAt": "2026-08-08T01:12:00.000Z",
    }
    req(guest, "PATCH", f"/games/{g1['id']}/notes", {"notes": [note]})

    auth = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(CookieJar())
    )
    try:
        user = req(
            auth,
            "POST",
            "/auth/register",
            {"username": "demo", "password": "demo"},
        )["user"]
        print(f"  registered demo / demo  ({user['id'][:8]}…)")
    except SystemExit as e:
        if "already taken" not in str(e):
            raise
        req(auth, "POST", "/auth/login", {"username": "demo", "password": "demo"})
        user = req(auth, "GET", "/auth/me")["user"]
        print("  signed in existing demo / demo")

    dad = next(p for p in g1["players"] if p["name"] == "Dad")
    req(
        auth,
        "POST",
        f"/auth/games/{g1['id']}/claim",
        {"playerId": dad["id"]},
    )
    print("  demo claimed Dad in Friday kitchen table")

    print("Seed complete.")


if __name__ == "__main__":
    main()
