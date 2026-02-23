const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const analytics = await prisma.analytics.findMany({
    where: { 
      socialAccount: { 
        userId: 3 
      } 
    },
    include: { socialAccount: true }
  });

  console.log('Analytics records for user 3:');
  analytics.forEach(rec => {
    console.log(`\n${rec.socialAccount.platform} - ${rec.socialAccount.accountName}`);
    console.log(`  Date: ${rec.date}`);
    console.log(`  Followers: ${rec.followers}`);
    console.log(`  Likes: ${rec.likes}`);
    console.log(`  Comments: ${rec.comments}`);
    console.log(`  Media Count: ${rec.mediaCount}`);
  });
}

check().finally(() => prisma.$disconnect());