import { createContext } from 'react';
import type { StoreContext } from './types';

export const Context = createContext<StoreContext | null>(null);
