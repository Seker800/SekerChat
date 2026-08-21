import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// 移动端视口高度修复：同步布局视口与可视视口，避免地址栏/键盘遮挡底部输入区
function setViewportHeight() {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const vh = viewportHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setViewportHeight();
window.addEventListener('resize', setViewportHeight);
window.visualViewport?.addEventListener('resize', setViewportHeight);
window.visualViewport?.addEventListener('scroll', setViewportHeight);
window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 100));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
