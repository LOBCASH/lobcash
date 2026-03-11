import { Router, type Request, type Response } from "express";

const router: Router = Router();

const GAME_SERVERS = [
  { region: "local", name: "Local Dev", address: "ws://localhost:19100" },
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
