import { GatewayDispatchEvents } from 'discord-api-types/v10';
import { ClientQuest } from './client.js';

let currentUserId: string | null = null;

const client = new ClientQuest(process.env.TOKEN!);
const questType = (process.env.QUEST_TYPE || 'BOTH').toUpperCase();

function matchesQuestType(quest: any) {
	if (questType === 'BOTH') return true;
	const rewards = quest.config.rewards_config?.rewards ?? [];
	const text = JSON.stringify({
		name: quest.config.messages?.quest_name,
		rewards,
	}).toLowerCase();
	const hasOrb = rewards.some((reward: any) => Number(reward.orb_quantity || 0) > 0) || text.includes('orb');
	if (questType === 'ORBS') return hasOrb;
	if (questType === 'DECOR') return !hasOrb || text.includes('decor');
	return true;
}

/*
client.on(
	GatewayDispatchEvents.MessageCreate,
	async ({ data: message, api }) => {
		console.log('Message received:', message.content);
		if (message.content === 'ping' && message.author.id === currentUserId) {
			await api.channels.createMessage(message.channel_id, {
				content: 'pong',
			});
		}
	},
);
*/

client.once(GatewayDispatchEvents.Ready, async ({ data, api }) => {
	currentUserId = data.user.id;
	if (process.env.GITHUB_ACTIONS === 'true') {
		console.log('Logged in!');
	} else {
		console.log(`Logged in as @${data.user.username}`);
	}

	await client.fetchQuests(false);
	const totalQuests = client.questManager!.size;
	const questsExpired = client.questManager!.getExpired();
	const questsCompleted = client.questManager!.getCompleted();
	const questsAll = client.questManager!.filterQuestsValidToDo();
	const questsMatching = questsAll.filter(matchesQuestType);
	// ponytail: handle one quest per daily run in API order; add priority rules if order matters.
	const questsValid = questsMatching.slice(0, 1);
	console.log(`Found ${questsValid.length} valid quests to do.`);
	console.log(`Quest type filter: ${questType} (${questsAll.length} before filter).`);
	console.log(`Quest scan: total=${totalQuests} valid=${questsValid.length} expired=${questsExpired.length} completed=${questsCompleted.length} filtered=${questsAll.length - questsMatching.length}.`);
	console.log(`Quest queue: ${questsMatching.length - questsValid.length} deferred to later runs.`);
	console.log('Quest list begin.');
	for (const quest of questsValid) {
		const taskName = Object.keys(quest.config.task_config_v2.tasks).find(
			(task) => quest.config.task_config_v2.tasks[task as keyof typeof quest.config.task_config_v2.tasks] != null,
		) ?? 'UNKNOWN';
		const rewards = quest.config.rewards_config?.rewards ?? [];
		const orbs = rewards.reduce((total: number, reward: any) => total + Number(reward.orb_quantity || 0), 0);
		const applicationId = String(quest.config.application?.id ?? '');
		const assetId = String(quest.config.assets?.game_tile ?? '');
		console.log(`Quest item: ${JSON.stringify({
			name: quest.config.messages.quest_name,
			task: taskName,
			image: applicationId && assetId ? `https://cdn.discordapp.com/app-assets/${applicationId}/${assetId}.png` : '',
			orbs,
			expiresAt: String(quest.config.expires_at ?? '')
		})}`);
	}
	console.log('Quest list end.');
	if (questsValid[0]) await client.questManager!.doingQuest(questsValid[0]).catch(error => console.error('Quest failed:', error));

	// Disconnect
	console.log('All quests processed. Disconnecting...');
	await client.destroy();
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('[Error:] Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error.message);
});

client.connect();
