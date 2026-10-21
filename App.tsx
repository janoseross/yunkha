import AppNavigator from './src/application/AppNavigator';
import AppProviders from './src/application/AppProviders';

export default function App() {
  return (
    <AppProviders>
      <AppNavigator />
    </AppProviders>
  );
}
