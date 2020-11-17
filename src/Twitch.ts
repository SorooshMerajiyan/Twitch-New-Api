import {
  BasicHeaders,
  TwitchAuthorizationHeaders,
  TwitchAuthRequestPayload,
  TwitchAuthResponsePayload,
  TwitchClient,
  TwitchResourceResponsePayload,
  TwitchStreamResponsePayload,
} from './types';
import fetch from 'node-fetch';
import { stringify } from 'querystring';

export class TwitchApi {
  public client: TwitchClient;
  private token?: string;
  private expiresAt?: Date;
  private endpoints = {
    auth: 'https://id.twitch.tv/oauth2/token',
  };

  /**
   * Creates a new instance of Twitch Heli Api Wrapper.
   *
   * @param client Client Credentials
   */
  constructor(client: TwitchClient) {
    this.client = client;
  }

  /**
   * Returns BasicHeaders for fetching.
   */
  private getBasicHeaders(): BasicHeaders {
    return { 'Content-Type': 'application/json' };
  }

  /**
   * Returns Twitch Authorization Headers for fetching.
   *
   * @param token Token to request with.
   */
  private getAuthorizationHeaders(token: string): TwitchAuthorizationHeaders {
    return {
      'Client-ID': this.client.id,
      Authorization: token,
    };
  }

  /***
   * Returns already fetched token OR fetches a new one if there's no valid token.
   *
   * @param retryCount How many times to retry if Twitch returned non OK status. defaults to 3
   * @param delay Should there be a delay between requests? (in miliseconds). defaults to 0
   */
  public async getToken(
    retryCount: number = 3,
    delay: number = 0
  ): Promise<string> {
    if (this.token && this.expiresAt && this.expiresAt > new Date()) {
      return this.token;
    }

    const getTokenFromTwitch = async (
      retryCount = 3,
      currentRetryCount = 0
    ): Promise<string> => {
      const body: TwitchAuthRequestPayload = {
        client_id: this.client.id,
        client_secret: this.client.secret,
        grant_type: 'client_credentials',
      };

      const res = await fetch(this.endpoints.auth, {
        method: 'POST',
        headers: {
          ...this.getBasicHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        return getTokenFromTwitch(retryCount, currentRetryCount + 1);
      }

      const resBody: TwitchAuthResponsePayload = await res.json();

      const prefix =
        resBody.token_type[0].toUpperCase() + resBody.token_type.slice(1);
      this.token = prefix + ' ' + resBody.access_token;
      this.expiresAt = new Date(Date.now() + resBody.expires_in);

      return this.token;
    };

    return getTokenFromTwitch(retryCount);
  }

  /**
   * Returns an array of live streams by id. (Wont return anything for offline streams.)
   *
   * @param ids an array of ids. (Example: 123321123)
   */
  public getStreamById(ids: string[]): Promise<TwitchStreamResponsePayload[]> {
    return this.getStream(ids, true);
  }

  /**
   * Returns an array of live streams by name. (Wont return anything for offline streams.)
   *
   * @param names an array of names. (Example: mechiller)
   */
  public getStreamByName(
    names: string[]
  ): Promise<TwitchStreamResponsePayload[]> {
    return this.getStream(names, false);
  }

  /**
   * Returns an array of all live streams.
   *
   * @param entries entries to get stream for.
   * @param isById search by Id?
   */
  private async getStream(
    entries: string[],
    isById: boolean
  ): Promise<TwitchStreamResponsePayload[]> {
    const token = await this.getToken();

    const entriesInHundred = [];
    const allEntries = Math.ceil(entries.length / 100);
    for (let i = 0; i < allEntries; i += 1) {
      entriesInHundred.push(entries.splice(0, 100));
    }

    const promises = entriesInHundred.map((currentEntry) => {
      const query = isById
        ? {
            user_id: currentEntry,
          }
        : {
            user_login: currentEntry,
          };

      return fetch('https://api.twitch.tv/helix/streams?' + query, {
        method: 'GET',
        headers: {
          ...this.getBasicHeaders(),
          ...this.getAuthorizationHeaders(token),
        },
      });
    });

    const responses = await Promise.all(promises);
    const resources: TwitchResourceResponsePayload[] = await Promise.all(
      responses.map((res) => res.json())
    );

    const streams = resources.filter((s) => s.data.length);
    const result: TwitchStreamResponsePayload[] = [];
    for (const stream of streams) {
      result.push(...stream.data);
    }

    return result;
  }
}
