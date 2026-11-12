import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * Last line of defence: if rendering throws (React or the board's canvas set-up), the
 * player sees a short message and a reload button instead of an empty Telegram window.
 * The balance is safe: it is saved on every change and results are decided before
 * the animation.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Rock Spin crashed:', error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const ru = (navigator.language || 'en').toLowerCase().startsWith('ru');
    return (
      <div className="crash" role="alert">
        <p className="crash__title">{ru ? 'Что-то пошло не так' : 'Something went wrong'}</p>
        <p className="crash__text">
          {ru
            ? 'Баланс и история сохранены. Перезагрузите игру.'
            : 'Your balance and history are saved. Reload the game.'}
        </p>
        <button type="button" className="crash__btn" onClick={() => window.location.reload()}>
          {ru ? 'Перезагрузить' : 'Reload'}
        </button>
      </div>
    );
  }
}
