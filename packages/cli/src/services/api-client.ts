import axios, { AxiosInstance } from 'axios';
import { read } from 'read';
import { LoginInput, LoginResponse } from '@reefguide/types';

export class ApiClientService {
  private apiClient: AxiosInstance;
  private token: string | null = null;
  private baseUrl = '';

  constructor() {
    this.apiClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Utility function to prompt for input
   */
  private async promptInput(question: string, hideInput = false): Promise<string> {
    return read<string>({ prompt: question, silent: hideInput }).then(result => {
      return (result || '').trim();
    });
  }

  /**
   * Get credentials from environment or prompt user
   */
  private async getCredentials(): Promise<{ username: string; password: string }> {
    let username = process.env.CLI_USERNAME;
    let password = process.env.CLI_PASSWORD;

    if (!username) {
      username = await this.promptInput('Enter username: ');
    } else {
      console.log(`Using username from environment: ${username}`);
    }

    if (!password) {
      password = await this.promptInput('Enter password: ', true);
    } else {
      console.log('Using password from environment variables');
    }

    return { username, password };
  }

  /**
   * Get API endpoint from environment or prompt user
   */
  private async getApiEndpoint(): Promise<string> {
    let endpoint = process.env.CLI_ENDPOINT;

    if (!endpoint) {
      endpoint = await this.promptInput('Enter API endpoint (e.g., http://localhost:5000/api): ');
    } else {
      console.log(`Using API endpoint from environment: ${endpoint}`);
    }

    // Remove trailing slash if present
    return endpoint.replace(/\/$/, '');
  }

  /**
   * Login and get authentication token
   */
  private async login(username: string, password: string): Promise<void> {
    try {
      console.log('🔐 Logging in...');
      const response = await this.apiClient.post<LoginResponse>(`${this.baseUrl}/auth/login`, {
        email: username,
        password: password
      } satisfies LoginInput);

      this.token = response.data.token;

      // Set authorization header for future requests
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

      console.log('✅ Login successful');
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid credentials');
      }
      throw new Error(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initialize the API client with authentication
   */
  async initialize(): Promise<void> {
    this.baseUrl = await this.getApiEndpoint();
    const { username, password } = await this.getCredentials();
    await this.login(username, password);
  }

  /**
   * Get the authenticated HTTP client
   */
  get client(): AxiosInstance {
    if (!this.token) {
      throw new Error('API client not initialized. Call initialize() first.');
    }
    return this.apiClient;
  }

  /**
   * Get the base API URL
   */
  get apiBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error('API client not initialized. Call initialize() first.');
    }
    return this.baseUrl;
  }

  /**
   * Check if the client is authenticated
   */
  get isAuthenticated(): boolean {
    return !!this.token;
  }
}
