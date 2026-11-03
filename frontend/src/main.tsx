import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import UserStore from "./store/UserStore";
import ContestStore from "./store/ContestStore";
import SolutionStore from './store/SolutionStore';
import PaymentStore from './store/PaymentStore';
import ChatStore from './store/ChatStore';
import { Context } from './context';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
      <Context.Provider value={{
          user: new UserStore(),
          contest: new ContestStore(),
          solution: new SolutionStore(),
          payment: new PaymentStore(),
          chat: new ChatStore(),
      }}>
        <App />
      </Context.Provider>
  </StrictMode>,
)
