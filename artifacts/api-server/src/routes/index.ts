import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import signersRouter from "./signers";
import ccRouter from "./cc";
import templatesRouter from "./templates";
import signaturesRouter from "./signatures";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";
import privilegesRouter from "./privileges";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(documentsRouter);
router.use(signersRouter);
router.use(ccRouter);
router.use(templatesRouter);
router.use(signaturesRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(privilegesRouter);

export default router;
