export interface AuthConfig {
  apiKey: string;
  uid: string;
  /** Optional bearer token (JWT). The app only sends Authorization when it has one. */
  token?: string;
}

export interface ApiHeaders {
  Mdapikey: string;
  Mduid: string;
  Authorization?: string;
  Cookie?: string;
}
