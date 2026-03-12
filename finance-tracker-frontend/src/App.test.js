import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./Report', () => () => <div>Mock Report</div>);

test('renders the report container', () => {
  render(<App />);
  expect(screen.getByText('Mock Report')).toBeInTheDocument();
});
