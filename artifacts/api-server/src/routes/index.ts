import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import signaturesRouter from "./signatures";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(signaturesRouter);
router.use(dashboardRouter);

export default router;
