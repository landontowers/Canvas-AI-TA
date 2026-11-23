import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="settings-view" role="alert" aria-label="Application Error Recovery">
          <div className="danger-zone-card">
            <h2>Something went wrong</h2>
            <p className="danger-description">{this.state.errorMessage}</p>
            <button
              type="button"
              className="send-button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
                  window.location.reload();
                }
              }}
            >
              Reload Drawer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
