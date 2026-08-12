const HAND_SIZES = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7] as const;

const SCORE_EXAMPLES = [
  { bid: 2, took: 2, score: '+7', made: true, why: 'Exact — 5 + 2 tricks' },
  { bid: 0, took: 0, score: '+5', made: true, why: 'Nil made — just the 5' },
  { bid: 1, took: 2, score: '−1', made: false, why: 'One over' },
  { bid: 0, took: 2, score: '−2', made: false, why: 'Two over a nil' },
  { bid: 3, took: 1, score: '−2', made: false, why: 'Two under' },
] as const;

export function RulesPage() {
  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">How to play</h2>
        <p className="lede">2–7 players · 13 rounds · standard deck</p>
      </div>

      <div className="page-fit-body stack howto">
        <section className="card stack-sm">
          <h3 className="section-title">The idea</h3>
          <p>
            Bid how many tricks you think you’ll take — then take{' '}
            <strong>exactly</strong> that many. No more, no fewer.
          </p>
          <p>Highest score after 13 rounds wins.</p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">In one minute</h3>
          <ol className="howto-ol">
            <li>Deal the cards. Flip the next one — that suit is trump.</li>
            <li>
              Left of the dealer bids first. Dealer bids last, and cannot make
              the bids add up exactly.
            </li>
            <li>
              Left of the dealer leads. Follow suit if you can. Highest trump
              wins; otherwise the highest card of the suit led.
            </li>
            <li>
              Made your bid? Score 5 plus your tricks. Missed? Lose 1 per trick
              you were off.
            </li>
            <li>
              Next round, deal one fewer card. Go down to 1, then back up to 7.
            </li>
          </ol>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">What you need</h3>
          <ul className="howto-ul">
            <li>2 to 7 players (best with 4–6)</li>
            <li>A standard 52-card deck</li>
            <li>About 45 minutes</li>
          </ul>
          <p className="howto-rank">
            Cards rank <strong>A K Q J 10 9 8 7 6 5 4 3 2</strong> — aces high.
          </p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">The 13 rounds</h3>
          <p>
            Each round, everyone is dealt the same number of cards. That number
            walks down to 1, then back up:
          </p>
          <div className="howto-hands" aria-label="Cards per player each round">
            {HAND_SIZES.map((n, i) => (
              <span
                key={i}
                className={`howto-hand${n === 1 ? ' valley' : ''}`}
              >
                {n}
              </span>
            ))}
          </div>
          <p className="hint">
            Round 1 is 7 cards. Round 7 is 1 card. Round 13 is 7 again.
          </p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">1. Deal</h3>
          <p>
            Sit in a circle. Pick a first dealer (the app asks when you start a
            game). After that, the deal passes left each round.
          </p>
          <p>
            Shuffle, then deal face down, one at a time, until everyone has
            that round’s number of cards.
          </p>
          <p>
            Flip the next card face up. <strong>That suit is trump</strong> —
            it beats every other suit this round. Set the rest of the deck
            aside.
          </p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">2. Bid</h3>
          <p>
            Starting left of the dealer and going left, each player says how
            many tricks they will try to take — any number from{' '}
            <strong>0</strong> up to the cards in their hand.
          </p>
          <p>
            You have to bid. You cannot pass. Bid 0 if you want to take
            nothing.
          </p>

          <div className="howto-callout">
            <p className="howto-callout-label">The hook</p>
            <p>
              The dealer bids last, and may <strong>not</strong> bid the number
              that would make everyone’s bids add up to the tricks in the
              round. Someone always has to miss.
            </p>
            <p>
              Example: 7 cards this round, bids so far add up to 6. The dealer
              cannot bid 1 (6 + 1 = 7). They can bid 0, or 2 through 7.
            </p>
          </div>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">3. Play</h3>
          <p>
            The player left of the dealer leads any card to start the first
            trick. After that, whoever won the last trick leads the next one.
          </p>
          <p>
            Play goes left. If you have a card of the suit that was led, you{' '}
            <strong>must</strong> play one. If you don’t, play any card —
            including trump.
          </p>
          <p>
            <strong>Highest trump wins.</strong> If nobody played trump, the
            highest card of the suit that was led wins. A card that is neither
            trump nor the suit led can never win.
          </p>
          <p>Keep going until every card in the hand has been played.</p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">4. Score</h3>
          <p>
            <strong>Made it exactly:</strong> 5 points + 1 per trick.
          </p>
          <p>
            <strong>Missed</strong> (over or under): lose 1 point for each
            trick you were off.
          </p>

          <div className="howto-table-wrap">
            <table className="howto-table">
              <caption className="sr-only">Scoring examples</caption>
              <thead>
                <tr>
                  <th>Bid</th>
                  <th>Took</th>
                  <th>Score</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {SCORE_EXAMPLES.map((row) => (
                  <tr key={`${row.bid}-${row.took}`}>
                    <td>{row.bid}</td>
                    <td>{row.took}</td>
                    <td className={row.made ? 'score pos' : 'score neg'}>
                      {row.score}
                    </td>
                    <td className="howto-table-why">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">A sample round</h3>
          <p>
            Four players, 3 cards each. Hearts are trump. Dana dealt, so Alex
            (on Dana’s left) bids and leads first.
          </p>
          <ul className="howto-ul">
            <li>Alex bids 1, Blair 0, Casey 1. Total so far: 2.</li>
            <li>Dana cannot bid 1 (that would make 3). Dana bids 0.</li>
            <li>
              Alex leads the queen of diamonds. Blair follows with the 3.
              Casey has no diamonds and plays the ace of hearts (trump). Dana
              follows with the 9 of diamonds.
            </li>
            <li>Casey’s trump wins. Casey leads the next trick.</li>
          </ul>
          <p>
            After three tricks: Alex 1, Blair 0, Casey 2, Dana 0. Scores: Alex
            +6, Blair +5, Casey −1, Dana +5.
          </p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">Who wins</h3>
          <p>
            Add up your points from all 13 rounds. Highest total wins. Tied
            scores share a place, and the next place is skipped — 1st, 2nd,
            2nd, 4th.
          </p>
        </section>

        <section className="card stack-sm">
          <h3 className="section-title">In this app</h3>
          <p>
            Tricks people take must add up to the hand size — there are only
            that many tricks.
          </p>
          <p>
            <strong>FB</strong> (Force Burn) is an optional mark on the
            dealer’s bid. It does not change the score. It just notes that they
            were blocked from the even number.
          </p>
        </section>
      </div>
    </div>
  );
}
