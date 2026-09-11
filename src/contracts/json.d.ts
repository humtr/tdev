export interface JsonArray extends Array<Json> {
}
export interface JsonObject {
    [key: string]: Json;
}
export type Json = null | boolean | number | string | JsonArray | JsonObject;
