import { Router } from "express";
import { detectFall } from "../controllers/fall.controller.js";

const router = Router();

router.post("/fall-detect", detectFall);

export default router;
