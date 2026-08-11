import { useEffect, useState } from 'react';
import { api } from '../api';

type Rules = {
  meta: {
    name: string;
    players: { min: number; max: number };
    rounds: number;
  };
  hand_sizes: number[];
  setup: Record<string, string>;
  bidding: Record<string, string>;
  play: Record<string, string>;
  scoring: Record<string, string>;
  validation: Record<string, string>;
};

export function RulesPage() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRules()
      .then((r) => setRules(r as Rules))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="banner">{error}</div>;
  if (!rules) return <div className="empty fill-center">Loading rules…</div>;

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">{rules.meta.name} rules</h2>
        <p className="lede">
          {rules.meta.players.min}–{rules.meta.players.max} players ·{' '}
          {rules.meta.rounds} rounds
        </p>
      </div>

      <div className="page-fit-body stack">
        <section className="card">
          <h3 className="section-title">Hand sizes</h3>
          <p className="list-item-meta" style={{ margin: 0, lineHeight: 1.7 }}>
            {rules.hand_sizes.map((c, i) => (
              <span key={i}>
                R{i + 1}: {c}
                {i < rules.hand_sizes.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        </section>

        <Section title="Setup" data={rules.setup} />
        <Section title="Bidding" data={rules.bidding} />
        <Section title="Play" data={rules.play} />
        <Section title="Scoring" data={rules.scoring} />
        <Section title="Validation" data={rules.validation} />
      </div>
    </div>
  );
}

function Section({
  title,
  data,
}: {
  title: string;
  data: Record<string, string>;
}) {
  return (
    <section className="card stack-sm">
      <h3 className="section-title">{title}</h3>
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <div
            style={{
              fontWeight: 600,
              marginBottom: 4,
              textTransform: 'capitalize',
            }}
          >
            {k.replaceAll('_', ' ')}
          </div>
          <div
            className="muted"
            style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}
          >
            {String(v).trim()}
          </div>
        </div>
      ))}
    </section>
  );
}
