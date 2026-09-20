import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./BudgetQuest', () => () => <div>Mock Budget Quest</div>);

test('renders Budget Quest', () => {
    render(<App />);
    expect(screen.getByText('Mock Budget Quest')).toBeInTheDocument();
});
