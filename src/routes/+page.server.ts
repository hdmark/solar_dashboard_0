import https from "https";
import { Agent, setGlobalDispatcher } from 'undici'

const agent = new Agent({
  connect: {
    rejectUnauthorized: false
  }
})

setGlobalDispatcher(agent)
export const load: any = async ({ fetch , params }: { fetch: any, params: any }) => {
//   const agent = new https.Agent({
//     rejectUnauthorized: false, // allow self-signed certs
//   });
  const res = await fetch(` https://envoy.local/api/v1/production/inverters`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization":
        "Bearer eyJraWQiOiI3ZDEwMDA1ZC03ODk5LTRkMGQtYmNiNC0yNDRmOThlZTE1NmIiLCJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiI0ODI1MjAwMDM0ODMiLCJpc3MiOiJFbnRyZXoiLCJlbnBoYXNlVXNlciI6Im93bmVyIiwiZXhwIjoxNzk2NTAwMTIyLCJpYXQiOjE3NjQ5NjQxMjIsImp0aSI6IjFkODE4MWU5LTEzNjEtNGUxNS1iMzEwLWQxZjJmODRkNTgwNiIsInVzZXJuYW1lIjoibWFyay5kLmJhc2tpbkBnbWFpbC5jb20ifQ.e2NkdZ-PgxXkqk2_rztK0WETND8MH8El5CQ5miR2EcH9hhq8ma52nTqeUcmkAxAvFHAa6h0E54CiXWqNx088tQ",
    },
    // agent
  });
  console.log(res);

  const item = await res.json();
  console.log(res);
  return { item };
};
