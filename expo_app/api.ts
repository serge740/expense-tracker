// services/api.ts
import axios from 'axios';

import ENV from './env';


// Create axios instance
const api = axios.create({
  baseURL: ENV.API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});



export default api;