import { z } from "npm:zod@4";
import { HttpError } from "./http.ts";

export { z };

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "invalid JSON", "bad_request");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error), "bad_request");
  return parsed.data;
}
