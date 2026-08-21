import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h1>出错了</h1>
          <p>应用遇到意外错误，请刷新页面重试。</p>
          <pre style={{ fontSize: 13, color: '#666', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            style={{ marginTop: 12, padding: '8px 16px' }}
          >
            刷新页面
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
