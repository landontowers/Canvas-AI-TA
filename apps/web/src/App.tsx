import { DemoShell } from './components/DemoShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

export default function App() {
  return (
    <ErrorBoundary>
      <DemoShell />
    </ErrorBoundary>
  );
}
