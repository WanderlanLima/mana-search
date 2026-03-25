import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6 font-sans selection:bg-purple-500/30">
          <div className="atmosphere fixed inset-0 pointer-events-none" />
          
          <div className="relative z-10 w-full max-w-2xl glass-surface rounded-[40px] p-12 border border-white/10 shadow-2xl space-y-8 text-center overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-red-600/10 blur-[100px] rounded-full" />
            
            <div className="w-24 h-24 bg-red-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-red-500/20">
              <AlertCircle size={48} className="text-red-400" />
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-display font-bold tracking-tight">Ops! Algo deu errado.</h1>
              <p className="text-white/40 text-lg max-w-md mx-auto leading-relaxed">
                O aplicativo encontrou um erro inesperado. Não se preocupe, seus dados estão seguros.
              </p>
            </div>

            <div className="p-6 bg-white/[0.03] border border-white/5 rounded-3xl text-left font-mono text-xs overflow-auto max-h-48 scrollbar-hide">
              <p className="text-red-400/80 mb-2 font-bold uppercase tracking-widest text-[10px]">Detalhes do Erro:</p>
              <pre className="text-white/60 whitespace-pre-wrap break-all">
                {this.state.error?.toString() || 'Erro desconhecido'}
                {'\n\n'}
                {typeof this.state.error === 'object' && JSON.stringify(this.state.error, null, 2)}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-white text-black rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-purple-400 transition-all active:scale-95 shadow-xl shadow-white/5"
              >
                <RefreshCcw size={18} />
                Recarregar App
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-white/5 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10"
              >
                <Home size={18} />
                Voltar ao Início
              </button>
            </div>

            <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/10 pt-8">
              Nightmare Engine v2.5 • Error Protocol
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
