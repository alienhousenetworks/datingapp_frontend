// src/components/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={s.page}>
          <div style={s.card}>
            <div style={s.icon}>⚡</div>
            <h2 style={s.title}>Something went wrong</h2>
            <p style={s.msg}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              style={s.btn}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const s = {
  page: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--dark-900)",
    minHeight: "100vh",
  },
  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 20,
    padding: "40px 32px",
    maxWidth: 400,
    textAlign: "center",
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 10,
  },
  msg: {
    fontSize: 13,
    color: "var(--dark-300)",
    lineHeight: 1.6,
    marginBottom: 24,
  },
  btn: {
    padding: "10px 28px",
    borderRadius: 24,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
  },
};
