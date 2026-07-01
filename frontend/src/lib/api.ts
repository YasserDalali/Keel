import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { apiBaseUrl } from "./api-base";

export const api = createClient<paths>({ baseUrl: apiBaseUrl });

api.use({
  onRequest({ request }) {
    const token = localStorage.getItem("token");
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});
