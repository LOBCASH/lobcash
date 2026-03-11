import { Router, type Request, type Response } from "express";

const router: Router = Router();

const GAME_SERVER_REGION = process.env.GAME_SERVER_REGION ?? "local";
const GAME_SERVER_NAME =
  process.env.GAME_SERVER_NAME ??
  (process.env.NODE_ENV === "production" ? "Primary" : "Local Dev");
const GAME_SERVER_PUBLIC_WS_URL =
  process.env.GAME_SERVER_PUBLIC_WS_URL ??
  "ws://localhost:19100";

const GAME_SERVERS = [
  {
    region: GAME_SERVER_REGION,
    name: GAME_SERVER_NAME,
    address: GAME_SERVER_PUBLIC_WS_URL,
  },
];

router.get("/getGame", (req: Request, res: Response) => {
  const region = (req.query.region as string) || "local";
  const server = GAME_SERVERS.find((s) => s.region === region) ?? GAME_SERVERS[0];
  res.json({ success: true, server });
});

router.get("/servers", (_req: Request, res: Response) => {
  res.json({ success: true, servers: GAME_SERVERS.map((s) => ({ region: s.region, name: s.name })) });
});

export default router;
