import { render, screen } from '@testing-library/react';

jest.mock('./Report', () => () => <div>Mock Report</div>);
jest.mock('./BudgetQuest', () => () => <div>Mock Budget Quest</div>);

// App reads REACT_APP_UI_V2 once at module scope, so the module has to be
// re-evaluated after the flag changes. Without this the suite silently inherits
// whatever is in .env and flips meaning when someone turns v2 on locally.
const renderApp = () => {
    let App;
    jest.isolateModules(() => {
        App = require('./App').default;
    });
    render(<App />);
};

describe('App', () => {
    const originalFlag = process.env.REACT_APP_UI_V2;

    afterEach(() => {
        if (originalFlag === undefined) {
            delete process.env.REACT_APP_UI_V2;
        } else {
            process.env.REACT_APP_UI_V2 = originalFlag;
        }
    });

    test('renders the report container when the flag is unset', () => {
        delete process.env.REACT_APP_UI_V2;
        renderApp();
        expect(screen.getByText('Mock Report')).toBeInTheDocument();
    });

    test('renders Budget Quest when the flag is true', () => {
        process.env.REACT_APP_UI_V2 = 'true';
        renderApp();
        expect(screen.getByText('Mock Budget Quest')).toBeInTheDocument();
    });

    test('anything other than true keeps the original UI', () => {
        process.env.REACT_APP_UI_V2 = '1';
        renderApp();
        expect(screen.getByText('Mock Report')).toBeInTheDocument();
    });
});
