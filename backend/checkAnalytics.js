const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const analytics = await prisma.analytics.findMany({
      where: { 
        socialAccount: { 
          userId: 1 
        } 
      },
      include: { 
        socialAccount: true 
      },
      orderBy: { 
        date: 'desc' 
      }
    });
    
    console.log('📊 Analytics records found:', analytics.length);
    
    if (analytics.length > 0) {
      console.log('Latest record:', JSON.stringify(analytics[0], null, 2));
      
      // Show summary
      console.log('\n📈 Summary for', analytics[0].socialAccount.platform, '-', analytics[0].socialAccount.accountName);
      console.log('   Date:', analytics[0].date);
      console.log('   Followers:', analytics[0].followers);
      console.log('   Likes:', analytics[0].likes);
      console.log('   Comments:', analytics[0].comments);
      console.log('   Media Count:', analytics[0].mediaCount);
    } else {
      console.log('No analytics records found yet.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check();