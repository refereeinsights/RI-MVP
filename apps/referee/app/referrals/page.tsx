"use client";

import { useEffect, useState } from "react";

type ReferralData = { ok: true; code: string; link: string };

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referrals")
      .then((res) => {
        if (res.redirected || res.status === 401) {
          return Promise.reject("auth");
        }
        if (!res.ok) return Promise.reject(res.statusText);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Please sign in to get your referral link.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Unable to copy—please copy manually.");
    }
  };

  if (error) {
    return (
      <main className="page">
        <div className="shell">
          <section className="referralCard">{error}</section>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="shell">
          <section className="referralCard">Loading your link…</section>
        </div>
      </main>
    );
  }

  const mailto = `mailto:?subject=Join RefereeInsights&body=Use my link to sign up: ${encodeURIComponent(
    data.link
  )}`;

  return (
    <main className="page">
      <div className="shell">
        <section className="referralCard" aria-labelledby="referrals-title">
          <p className="referralEyebrow">Referral program</p>
          <h1 id="referrals-title">Invite refs, unlock early features</h1>
          <p className="referralCopy">
            Share your link to bring trusted officials into Referee Insights. Each verified referral
            helps crews and moves you up the queue.
          </p>

          <div className="referralLinkRow">
            <code className="referralLink">{data.link}</code>
            <button className="referralBtn primary" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <div className="referralCTA">
            <a className="referralBtn secondary" href={mailto}>
              Send via email
            </a>
          </div>

          <ul className="referralList">
            <li>Unique invite link</li>
            <li>Track referrals in your profile</li>
            <li>Priority access to new markets</li>
          </ul>
        </section>
      </div>
      <style jsx>{`
        .referralCard {
          background: #f8f6f1;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 18px;
          padding: 1.75rem;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
          max-width: 720px;
          margin: 2rem auto;
        }
        .referralEyebrow {
          margin: 0;
          letterSpacing: 0.12em;
          textTransform: uppercase;
          font-size: 12px;
          color: #0f3d2e;
          font-weight: 800;
        }
        .referralCopy {
          margin: 0.5rem 0 1rem;
          line-height: 1.6;
        }
        .referralLinkRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 10px;
        }
        .referralLink {
          padding: 10px 12px;
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 10px;
          font-size: 14px;
          word-break: break-all;
          flex: 1;
        }
        .referralBtn {
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 140px;
        }
        .referralBtn.primary {
          background: #0f3d2e;
          color: #fff;
        }
        .referralBtn.secondary {
          background: #fff;
          color: #0f3d2e;
          border: 1px solid rgba(0, 0, 0, 0.12);
        }
        .referralCTA {
          margin-top: 12px;
        }
        .referralList {
          margin: 1.2rem 0 0;
          padding-left: 1.1rem;
          line-height: 1.5;
        }
        @media (max-width: 640px) {
          .referralLinkRow {
            flex-direction: column;
            align-items: stretch;
          }
          .referralBtn {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
