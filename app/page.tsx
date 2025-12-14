export default function Home() {
  return (
    <main
      style={{
        padding: "4rem 2rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          maxWidth: 960,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: "3rem",
            margin: 0,
            fontWeight: 700,
          }}
        >
          Referee-first transparency
        </h1>

        {/* Official slogan */}
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.875rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#333",
          }}
        >
          INSIGHT BEFORE YOU ACCEPT
        </p>

        {/* Supporting copy */}
        <p
          style={{
            maxWidth: 720,
            margin: "1.5rem auto 0",
            fontSize: "1.125rem",
            lineHeight: 1.6,
            color: "#333",
          }}
        >
          Referee Insights helps officials make smarter assignment decisions by
          providing transparency into tournaments, schools, and assignors —
          powered by real referee experiences and unbiased insight.
        </p>
      </section>
    </main>
  );
}

