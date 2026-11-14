import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without a boundary, any uncaught render/effect error unmounts the whole
// React tree and leaves a black, unresponsive window.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Uncaught UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 gradient-mesh text-texto p-8">
          <h2 className="text-lg font-semibold text-peligro">
            Se ha producido un error inesperado
          </h2>
          <pre className="tarjeta max-w-xl max-h-48 overflow-auto text-xs text-texto-suave bg-hundido p-4 whitespace-pre-wrap">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="btn-primario text-sm"
          >
            Reiniciar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
