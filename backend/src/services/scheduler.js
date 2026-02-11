// src/services/scheduler.js - COMPLETE FIXED VERSION
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function publishScheduledDraft(draftId) {
    try {
        console.log(`🚀 Publishing scheduled draft: ${draftId}`);
        
        const draft = await prisma.draft.findUnique({
            where: { id: draftId },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                },
                publishedPosts: true
            }
        });

        if (!draft) {
            console.log(`❌ Draft ${draftId} not found`);
            return { success: false, error: 'Draft not found' };
        }

        // Check if already published
        if (draft.status === 'PUBLISHED') {
            console.log(`✅ Draft ${draftId} already published`);
            return { success: true, message: 'Already published' };
        }

        // IMPORTANT: Only process SCHEDULED drafts
        if (draft.status !== 'SCHEDULED') {
            console.log(`⚠️ Draft ${draftId} is not SCHEDULED, status: ${draft.status}. Skipping.`);
            return { success: false, error: `Not scheduled, status: ${draft.status}` };
        }

        // Platform account extraction logic
        // Aapke controller ko socialAccountIds chahiye hote hain. 
        // Agar analytics mein nahi hain, toh hum un accounts ko dhundte hain jo draft ke platform se match karein
        const analytics = draft.analytics || {};
        let socialAccountIds = analytics.socialAccountIds || [];
        
        // Safety: Agar analytics khali hai, toh user ki social connections se IDs nikaal lo
        if (socialAccountIds.length === 0) {
            const userConnections = await prisma.socialConnection.findMany({
                where: { userId: draft.userId }
            });
            socialAccountIds = userConnections.map(c => c.id);
        }

        if (socialAccountIds.length === 0) {
            console.log(`❌ Draft ${draftId} has no social accounts selected`);
            await prisma.draft.update({
                where: { id: draftId },
                data: { 
                    status: 'REJECTED', 
                    rejectionReason: 'No social accounts selected for scheduled post' 
                }
            });
            return { success: false, error: 'No social accounts selected' };
        }

        console.log(`📤 Publishing to ${socialAccountIds.length} accounts`);

        // Import social controller
        const socialController = require('../controllers/socialController');
        
        // Create request object for the controller
        const mockReq = {
            params: { draftId: draftId.toString() },
            body: { socialAccountIds: socialAccountIds }
        };

        // Call publish function
        // Note: Controller khud status update (PUBLISHED) handle kar raha hai,
        // isliye scheduler mein dobara update karne ki zaroorat nahi agar wo success ho jaye.
        const publishResult = await socialController.publishToSocialMedia(mockReq, null);
        
        if (publishResult.success) {
            console.log(`✅ Draft ${draftId} published successfully`);
            return { success: true, message: 'Published successfully' };
        } else {
            // Failed - update to REJECTED (FAILED nahi chalta)
            await prisma.draft.update({
                where: { id: draftId },
                data: { 
                    status: 'REJECTED',
                    rejectionReason: `Scheduled publishing failed: ${publishResult.error || 'Unknown error'}`
                }
            });
            console.log(`❌ Draft ${draftId} publishing failed: ${publishResult.error}`);
            return { success: false, error: publishResult.error };
        }

    } catch (error) {
        console.error(`❌ Error publishing draft ${draftId}:`, error);
        
        // Final fallback to REJECTED on crash
        await prisma.draft.update({
            where: { id: draftId },
            data: { 
                status: 'REJECTED',
                rejectionReason: `Scheduler error: ${error.message.substring(0, 200)}`
            }
        });
        
        return { success: false, error: error.message };
    }
}
cron.schedule('* * * * *', async () => {
    console.log('🔍 Checking for scheduled posts...');
    const now = new Date();
    
    try {
        // Find SCHEDULED posts that are due (past their scheduled time)
        const scheduledDrafts = await prisma.draft.findMany({
            where: {
                status: 'SCHEDULED',
                scheduledAt: {
                    lte: now,
                    not: null
                }
            },
            orderBy: {
                scheduledAt: 'asc'
            }
        });
        
        console.log(`📅 Found ${scheduledDrafts.length} scheduled posts ready to publish`);
        
        if (scheduledDrafts.length === 0) {
            console.log('✅ No scheduled posts to publish right now.');
            return;
        }
        
        // Process each scheduled draft
        for (const draft of scheduledDrafts) {
            console.log(`⏰ Processing scheduled draft ${draft.id} (scheduled for ${draft.scheduledAt})`);
            
            // Check if it's really due (with 1 minute buffer)
            const scheduledTime = new Date(draft.scheduledAt);
            const timeDiff = (now - scheduledTime) / (1000 * 60); // difference in minutes
            
            if (timeDiff >= -1) { // Allow 1 minute before scheduled time
                await publishScheduledDraft(draft.id);
            } else {
                console.log(`⏳ Draft ${draft.id} not due yet (${-timeDiff.toFixed(1)} minutes remaining)`);
            }
        }
        
        console.log('✅ Scheduler run completed');
        
    } catch (error) {
        console.error('❌ Scheduler main loop error:', error);
    }
});
console.log('⏰ Scheduler started. Running every minute to check scheduled posts.');