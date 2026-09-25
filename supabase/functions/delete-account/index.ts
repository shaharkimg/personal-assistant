// POST /delete-account { confirm: "DELETE" } — erases files and the auth user; FK cascades remove all rows.
import { handler, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validate.ts";

const Body = z.object({ confirm: z.literal("DELETE") });

Deno.serve(handler(async (req) => {
  const { userId } = await requireUser(req);
  await parseBody(req, Body);
  const admin = adminClient();

  // Remove every stored file under the user's folder.
  for (;;) {
    const { data: files, error } = await admin.storage.from("documents").list(userId, { limit: 1000 });
    if (error) throw error;
    if (!files?.length) break;
    await admin.storage.from("documents").remove(files.map((f) => `${userId}/${f.name}`));
    if (files.length < 1000) break;
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
  return json(req, { deleted: true });
}));
