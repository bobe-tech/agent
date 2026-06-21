import { render, screen } from '@testing-library/react';
import { server } from '@/test/msw';
import { dashboardHandlers } from '@/test/handlers';
import { App } from './App.js';

beforeEach(() => {
  server.use(...dashboardHandlers());
});

it('renders the footer with social links', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/bobeapp');
  expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:info@bobe.app');
});

it('renders the dashboard root container', () => {
  render(<App />);
  expect(screen.getByTestId('dashboard-root')).toBeInTheDocument();
});
