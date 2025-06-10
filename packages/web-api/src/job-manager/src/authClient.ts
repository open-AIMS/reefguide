import axios, {AxiosInstance, AxiosRequestConfig} from 'axios';
import {jwtDecode} from 'jwt-decode';
import {logger} from './logging';

/**
 * Interface for authentication credentials
 */
interface Credentials {
  /** User email for authentication */
  email: string;
  /** User password for authentication */
  password: string;
}

/**
 * Interface for JWT authentication tokens
 */
interface AuthTokens {
  /** Access token for API authorization */
  token: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;
}

/**
 * Interface for decoded JWT payload structure
 */
interface JWTPayload {
  /** User ID */
  id: string;
  /** User email */
  email: string;
  /** User roles/permissions */
  roles: string[];
  /** Token expiration timestamp */
  exp: number;
}

/**
 * Custom error class for API-related errors
 * Includes status code and original response for better error handling
 */
export class ApiError extends Error {
  /**
   * Creates a new API error
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param response - Optional original response object
   */
  constructor(
    message: string,
    public statusCode: number,
    public response?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Client for authenticated API requests
 * Handles login, token refresh, and authenticated HTTP requests
 */
export class AuthApiClient {
  private axiosInstance: AxiosInstance;

  private credentials: Credentials;

  private tokens: AuthTokens | null = null;

  private readonly TOKEN_REFRESH_THRESHOLD = 60; // 1 minute in seconds

  /**
   * Creates a new authenticated API client
   * @param baseURL - Base URL for the API
   * @param credentials - Authentication credentials
   */
  constructor(baseURL: string, credentials: Credentials) {
    this.credentials = credentials;
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.debug('AuthApiClient initialized', {baseURL});

    // Add request interceptor to handle token management
    this.axiosInstance.interceptors.request.use(
      async config => {
        // Skip authentication for login and register endpoints
        if (
          config.url?.endsWith('/auth/login') ||
          config.url?.endsWith('/auth/register') ||
          config.url?.endsWith('/auth/token')
        ) {
          return config;
        }

        const token = await this.getValidToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      error => Promise.reject(error),
    );
  }

  /**
   * Gets a valid token, refreshing or logging in if necessary
   * @returns A valid JWT token or null if authentication failed
   * @private
   */
  private async getValidToken(): Promise<string | null> {
    if (!this.tokens?.token) {
      logger.debug('No token available, initiating login');
      await this.login();
      return this.tokens?.token || null;
    }

    const decodedToken = jwtDecode<JWTPayload>(this.tokens.token);
    const expiresIn = decodedToken.exp - Math.floor(Date.now() / 1000);

    if (expiresIn <= this.TOKEN_REFRESH_THRESHOLD) {
      logger.debug(`Token expires in ${expiresIn}s, refreshing`);
      await this.refreshToken();
    }

    return this.tokens?.token || null;
  }

  /**
   * Authenticates with the API using provided credentials
   * @throws Error if login fails
   * @private
   */
  private async login(): Promise<void> {
    try {
      logger.info('Logging in to API');
      const response = await this.axiosInstance.post<AuthTokens>(
        '/auth/login',
        this.credentials,
      );
      this.tokens = response.data;
      logger.debug('Login successful, token received');
    } catch (error) {
      logger.error('Failed to login', {error});
      throw new Error('Failed to login');
    }
  }

  /**
   * Refreshes the access token using the refresh token
   * Falls back to login if refresh fails
   * @private
   */
  private async refreshToken(): Promise<void> {
    logger.info('Token refresh started at:', new Date().toISOString());
    try {
      if (!this.tokens?.refreshToken) {
        logger.warn('No refresh token available, falling back to login');
        await this.login();
        return;
      }

      const response = await this.axiosInstance.post<AuthTokens>(
        '/auth/token',
        {
          refreshToken: this.tokens.refreshToken,
        },
      );

      if (response.status !== 200) {
        logger.warn('Non 200 response from refresh token endpoint', {
          status: response.status,
        });
        throw new Error(
          `Non 200 response from refresh token. Code: ${response.status}.`,
        );
      }

      this.tokens = {
        ...this.tokens,
        token: response.data.token,
      };
      logger.debug('Token refreshed successfully');
    } catch (error) {
      logger.error('Error during token refresh, falling back to login', {
        error,
      });
      // If refresh fails, try logging in again
      this.tokens = null;
      // awaiting login
      await this.login();
    }
    logger.info('Token refresh completed at:', new Date().toISOString());
  }

  /**
   * Performs a GET request to the API
   * @param url - Endpoint URL (relative to base URL)
   * @param config - Optional Axios request configuration
   * @returns Response data
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    logger.debug('GET request', {url});
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  /**
   * Performs a POST request to the API
   * @param url - Endpoint URL (relative to base URL)
   * @param data - Request body data
   * @param config - Optional Axios request configuration
   * @returns Response data
   */
  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    logger.debug('POST request', {url});
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PUT request to the API
   * @param url - Endpoint URL (relative to base URL)
   * @param data - Request body data
   * @param config - Optional Axios request configuration
   * @returns Response data
   */
  public async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    logger.debug('PUT request', {url});
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PATCH request to the API
   * @param url - Endpoint URL (relative to base URL)
   * @param data - Request body data
   * @param config - Optional Axios request configuration
   * @returns Response data
   */
  public async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    logger.debug('PATCH request', {url});
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a DELETE request to the API
   * @param url - Endpoint URL (relative to base URL)
   * @param config - Optional Axios request configuration
   * @returns Response data
   */
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    logger.debug('DELETE request', {url});
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }
}
