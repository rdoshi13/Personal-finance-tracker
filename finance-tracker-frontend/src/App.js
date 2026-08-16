import React from 'react';
import './App.css';
import Report from './Report';
import BudgetQuest from './BudgetQuest';

// Both UIs are compiled while the rework lands. Set REACT_APP_UI_V2=true to serve the
// new Budget Quest shell; anything else keeps the original Report view. Once v2 is
// signed off, this branch, Report.js and Report.test.js all go in one cleanup commit.
const useV2 = String(process.env.REACT_APP_UI_V2).toLowerCase() === 'true';

function App() {
  if (useV2) {
    return <BudgetQuest />;
  }

  return (
    <div className="App">
      <Report />
    </div>
  );
}

export default App;
