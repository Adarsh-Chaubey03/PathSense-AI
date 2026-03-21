import { Router } from 'express';
import type { Request, Response } from 'express';
import type { FallEventRequest, FallEventResponse } from '../types/fall.ts';
import { handleFallEvent } from '../services/validationService.ts';

const router = Router();

/**
 * POST /fall-event
 *
 * Processes a potential fall event from sensor data.
 *
 * Request body:
 * {
 *   "motionScore": number,       // Required: motion stability score (0-1)
 *   "orientationChange": boolean, // Required: whether device orientation changed
 *   "transcript": string          // Optional: user's voice response transcript
 * }
 *
 * Response:
 * {
 *   "status": "CONFIRMED" | "REJECTED" | "UNCERTAIN",
 *   "sosTriggered": boolean
 * }
 */
router.post('/fall-event', async (req: Request, res: Response): Promise<void> => {
  try {
    const { motionScore, orientationChange, transcript } = req.body;

    // Validate required fields
    if (typeof motionScore !== 'number') {
      res.status(400).json({
        error: 'Invalid request: motionScore must be a number',
      });
      return;
    }

    if (typeof orientationChange !== 'boolean') {
      res.status(400).json({
        error: 'Invalid request: orientationChange must be a boolean',
      });
      return;
    }

    // Validate motionScore range
    if (motionScore < 0 || motionScore > 1) {
      res.status(400).json({
        error: 'Invalid request: motionScore must be between 0 and 1',
      });
      return;
    }

    // Validate transcript if provided
    if (transcript !== undefined && typeof transcript !== 'string') {
      res.status(400).json({
        error: 'Invalid request: transcript must be a string if provided',
      });
      return;
    }

    const request: FallEventRequest = {
      motionScore,
      orientationChange,
      transcript,
    };

    const response: FallEventResponse = await handleFallEvent(request);

    res.status(200).json(response);
  } catch (error) {
    console.error('[FallRoutes] Error processing fall event:', error);
    res.status(500).json({
      error: 'Internal server error while processing fall event',
    });
  }
});

export default router;
