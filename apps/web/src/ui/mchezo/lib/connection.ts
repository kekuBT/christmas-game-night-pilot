/** This device's connection, as the banner shows it (plain TS, so unit tests can load the store). */
export type ConnectionState = "online" | "reconnecting" | "restored" | "replaced" | "signed-out";
