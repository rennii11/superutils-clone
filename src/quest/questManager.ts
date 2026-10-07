import { APIApplication } from 'discord-api-types/v10';
import { ClientQuest } from './client.js';
import type {
	AllQuestsResponse,
	QuestTaskConfigType,
} from './interface.js';
import { Quest } from './quest.js';
import { Utils } from './utils.js';

export class QuestManager implements Iterable<Quest> {
	private readonly quests = new Map<string, Quest>();
	public readonly client: ClientQuest;
	constructor(client: ClientQuest, quests: Quest[] = []) {
		this.client = client;
		quests.forEach((quest) => this.quests.set(quest.id, quest));
	}

	static async fromResponse(
		client: ClientQuest,
		response: AllQuestsResponse,
		fetchExcludedQuests = false,
	): Promise<QuestManager> {
		if (response.quest_enrollment_blocked_until !== null) {
			throw new Error(
				`Quest enrollment is blocked until ${response.quest_enrollment_blocked_until}.`,
			);
		}
		const questManager = new QuestManager(
			client,
			response.quests.map((quest) => Quest.create(quest)),
		);
		if (fetchExcludedQuests) {
			for (const quest of response.excluded_quests) {
				if (quest.id) {
					await questManager.addExcludedQuest(quest.id);
				}
			}
		}
		return Promise.resolve(questManager);
	}

	protected addExcludedQuest(questId: string) {
		// fetch quest details and add to quests
		return this.client.rest
			.get(`/quests/${questId}`)
			.then((response) => {
				const quest = Quest.create({
					id: questId,
					config: response as any,
					user_status: null,
					targeted_content: 0,
					preview: false,
				});
				console.log(
					`Added excluded quest "${quest.config.messages.quest_name}" to the quest manager.`,
				);
				this.quests.set(quest.id, quest);
			})
			.catch((err) => {
				console.error(
					`Failed to fetch excluded quest "${questId}".`,
					err.message,
				);
			});
	}

	[Symbol.iterator](): IterableIterator<Quest> {
		return this.quests.values();
	}

	get size(): number {
		return this.quests.size;
	}

	list(): Quest[] {
		return Array.from(this.quests.values());
	}

	get(id: string): Quest | undefined {
		return this.quests.get(id);
	}

	upsert(quest: Quest): void {
		this.quests.set(quest.id, quest);
	}

	remove(id: string): boolean {
		return this.quests.delete(id);
	}

	clear(): void {
		this.quests.clear();
	}

	getExpired(date: Date = new Date()): Quest[] {
		return this.list().filter((quest) => quest.isExpired(date));
	}

	getCompleted(): Quest[] {
		return this.list().filter((quest) => quest.isCompleted());
	}

	hasQuest(id: string): boolean {
		return this.quests.has(id);
	}

	filterQuestsValidToDo() {
		return this.list().filter(
			(quest) => !quest.isCompleted() && !quest.isExpired(),
		);
	}

	getApplicationData(ids: string[]) {
		const query = new URLSearchParams();
		ids.forEach((id) => query.append('application_ids', id));
		return this.client.rest.get(`/applications/public`, {
			query,
		}) as Promise<
			{
				// Partial<ApplicationData>
				id: string;
				name: string;
				icon: string;
				description: string;
				executables: {
					os: string;
					name: string;
					is_launcher: boolean;
				}[];
			}[]
		>;
	}

	/**
	 * Enroll in a quest.
	 * @param quest quest to enroll in
	 * @param isAndroid boolean
	 * @warning This API is heavily rate-limited (45 minutes). Use with caution.
	 */
	acceptQuest(quest: Quest, isAndroid = false): Promise<Quest | undefined> {
		// console.log(`Accepting quest "${questId}"...`);
		return this.client.rest
			.post(`/quests/${quest.id}/enroll`, {
				body: {
					location: isAndroid ? 12 : 11, // QUEST_HOME_MOBILE : QUEST_HOME_DESKTOP | https://docs.discord.food/resources/quests#quest-content-type
					// location: 19, // QUEST_SHARE_LINK
					is_targeted: false,
					metadata_sealed: null,
					traffic_metadata_raw: quest.raw.traffic_metadata_raw,
					traffic_metadata_sealed: quest.raw.traffic_metadata_sealed,
				},
				headers: {
					AndroidRequest: isAndroid ? 'true' : 'false',
				},
			})
			.then((r) => {
				const q = this.get(quest.id);
				q?.updateUserStatus(r as any);
				return q;
			});
	}

	private async timeout(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async doingQuest(quest: Quest) {
		const questName = quest.config.messages.quest_name;
		const isAndroid =
			Boolean(quest.config.task_config_v2.tasks.WATCH_VIDEO_ON_MOBILE) &&
			!Boolean(quest.config.task_config_v2.tasks.WATCH_VIDEO);
		if (!quest.isEnrolledQuest()) {
			console.log(
				`Enrolling in quest "${questName}" (${isAndroid ? 'Android' : 'Desktop'} version)...`,
			);
			try {
				await this.acceptQuest(quest, isAndroid);
			} catch (err: any) {
				console.error(
					`Failed to enroll in quest "${questName}".`,
					err?.message,
				);
				return;
			}
		} else {
			console.log(`Already enrolled in quest "${questName}".`);
		}
		const applicationName = quest.config.application.name;
		const taskConfig = quest.config.task_config_v2;
		const taskName = [
			'WATCH_VIDEO',
			'PLAY_ON_DESKTOP',
			'PLAY_ON_XBOX',
			'PLAY_ON_PLAYSTATION',
			'STREAM_ON_DESKTOP',
			'PLAY_ACTIVITY',
			'WATCH_VIDEO_ON_MOBILE',
			'ACHIEVEMENT_IN_ACTIVITY',
		].find(
			(x) => taskConfig.tasks[x as QuestTaskConfigType] != null,
		) as QuestTaskConfigType;
		const secondsNeeded = taskConfig.tasks[taskName].target;
		let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
		switch (taskName) {
			case 'WATCH_VIDEO':
			case 'WATCH_VIDEO_ON_MOBILE': {
				await this.doingWatchVideoQuest(
					quest,
					questName,
					secondsNeeded,
					secondsDone,
				);
				break;
			}
			case 'PLAY_ON_XBOX':
			case 'PLAY_ON_PLAYSTATION':
			case 'PLAY_ON_DESKTOP': {
				await this.doingPlayOnPlatformQuest(
					quest,
					questName,
					secondsNeeded,
					taskName,
					applicationName,
				);
				break;
			}
			case 'PLAY_ACTIVITY': {
				await this.doingPlayActivityQuest(
					quest,
					questName,
					secondsNeeded,
					taskName,
					applicationName,
				);
				break;
			}
			case 'STREAM_ON_DESKTOP': {
				console.log(
					'This no longer works in node for non-video quests. Use the discord desktop app to complete the',
					questName,
					'quest!',
				);
				break;
			}
			case 'ACHIEVEMENT_IN_ACTIVITY': {
				await this.doingAchievementInActivityQuest(quest, questName);
				break;
			}
			default: {
				console.log(
					'Unknown quest type. Use the discord desktop app to complete the',
					questName,
					'quest!',
				);
			}
		}
	}
	async doingWatchVideoQuest(
		quest: Quest,
		questName: string,
		secondsNeeded: number,
		secondsDone: number,
	) {
		const maxFuture = 10,
			speed = 7,
			interval = 7;
		const enrolledAt = new Date(
			quest.userStatus?.enrolled_at as any,
		).getTime();
		let completed = false;
		let fn = async () => {
			while (true) {
				const maxAllowed =
					Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
				const diff = maxAllowed - secondsDone;
				const timestamp = secondsDone + speed;
				if (diff >= speed) {
					const res = (await this.client.rest.post(
						`/quests/${quest.id}/video-progress`,
						{
							body: {
								timestamp: Math.min(
									secondsNeeded,
									timestamp + Math.random(),
								),
							},
						},
					)) as any;
					completed = res.completed_at != null;
					secondsDone = Math.min(secondsNeeded, timestamp);
					this.logQuestProgress(questName, 'WATCH_VIDEO', secondsDone, secondsNeeded);
				}

				if (timestamp >= secondsNeeded) {
					break;
				}
				await this.timeout(interval * 1000);
			}
			if (!completed) {
				await this.client.rest.post(
					`/quests/${quest.id}/video-progress`,
					{
						body: { timestamp: secondsNeeded },
					},
				);
			}
			console.log(`Quest "${questName}" completed!`);
			this.client.emitQuestCompleted(quest.id);
		};
		console.log(`Spoofing video for ${questName}.`);
		this.logQuestProgress(questName, 'WATCH_VIDEO', secondsDone, secondsNeeded);
		await fn();
	}
	async doingPlayOnPlatformQuest(
		quest: Quest,
		questName: string,
		secondsNeeded: number,
		taskName: string,
		applicationName: string,
	) {
		const interval = 20;
		while (!quest.isCompleted()) {
			const secondsDone =
				(quest.userStatus?.progress?.[taskName]?.value as number) || 0;
			const res = await this.client.rest.post(
				`/quests/${quest.id}/heartbeat`,
				{
					body: {
						application_id: quest.config.application.id,
						terminal: false,
					},
				},
			);
			quest.updateUserStatus(res as any);
			const nextSecondsDone =
				(quest.userStatus?.progress?.[taskName]?.value as number) || secondsDone;
			this.logQuestProgress(questName, taskName, nextSecondsDone, secondsNeeded);
			console.log(
				`Spoofed your game to ${applicationName}. Wait for ${Math.ceil(
					(secondsNeeded - nextSecondsDone) / 60,
				)} more minute(s).`,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, interval * 1000),
			);
		}
		const res = await this.client.rest.post(
			`/quests/${quest.id}/heartbeat`,
			{
				body: {
					application_id: quest.config.application.id,
					terminal: true,
				},
			},
		);
		quest.updateUserStatus(res as any);
		console.log(`Quest "${questName}" completed!`);
		this.client.emitQuestCompleted(quest.id);
	}
	async doingPlayActivityQuest(
		quest: Quest,
		questName: string,
		secondsNeeded: number,
		taskName: string,
		applicationName: string,
	) {
		const interval = 20;
		const streamKey = 'call:1:1'; // Todo: call:channel_id:user_id | guild:guild_id:channel_id:user_id
		while (!quest.isCompleted()) {
			const secondsDone =
				(quest.userStatus?.progress?.[taskName]?.value as number) || 0;
			const res = await this.client.rest.post(
				`/quests/${quest.id}/heartbeat`,
				{
					body: { stream_key: streamKey, terminal: false },
				},
			);
			quest.updateUserStatus(res as any);
			const nextSecondsDone =
				(quest.userStatus?.progress?.[taskName]?.value as number) || secondsDone;
			this.logQuestProgress(questName, taskName, nextSecondsDone, secondsNeeded);
			console.log(
				`Spoofed your activity to ${applicationName}. Wait for ${Math.ceil(
					(secondsNeeded - nextSecondsDone) / 60,
				)} more minute(s).`,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, interval * 1000),
			);
		}
		const res = await this.client.rest.post(
			`/quests/${quest.id}/heartbeat`,
			{
				body: { stream_key: streamKey, terminal: true },
			},
		);
		quest.updateUserStatus(res as any);
		console.log(`Quest "${questName}" completed!`);
		this.client.emitQuestCompleted(quest.id);
	}
	async doingAchievementInActivityQuest(quest: Quest, questName: string) {
		// 1. Get application ID
		const applicationId = quest.config.application.id;
		const applicationName = quest.config.application.name;
		const questTarget =
			quest.config.task_config_v2.tasks.ACHIEVEMENT_IN_ACTIVITY.target;
		// 2. Authorize
		const query = new URLSearchParams({
			response_type: 'code',
			client_id: applicationId,
			scope: 'identify applications.commands applications.entitlements',
			state: '',
		});
		const res2 = (await this.client.rest.post(`/oauth2/authorize`, {
			query,
			body: {
				permissions: '0',
				authorize: true,
				integration_type: 1,
				location_context: {
					guild_id: '10000',
					channel_id: '10000',
					channel_type: 10000,
				},
			},
		})) as Record<string, any>;
		console.log(`Authorized application ${applicationName}`);
		const location = res2?.location;
		let authCode: string | null = null;
		if (location) {
			authCode = new URL(location).searchParams.get('code');
		}
		if (!authCode) {
			console.error(
				`No auth code received for application ${applicationName}. Cannot complete the quest.`,
			);
			return;
		}
		// 3. Complete achievement in activity
		const { token, error: authError, activityReferrer } = await Utils.authorizeDiscordSays(
			applicationId,
			quest.id,
			authCode,
			this.client,
		);
		if (authError || !token) {
			console.error(
				`Failed to authorize with Discord Says for application ${applicationName}. Cannot complete the quest.`,
				authError,
			);
			return;
		}
		const { success, error: progressError } =
			await Utils.progressDiscordSays(
				applicationId,
				quest.id,
				token,
				questTarget,
				activityReferrer,
			);
		if (progressError || !success) {
			console.error(
				`Failed to progress quest with Discord Says for application ${applicationName}. Cannot complete the quest.`,
				progressError,
			);
			return;
		}
		// 4. Deauthorize
		const res3 = (await this.client.rest.get(`/oauth2/tokens`)) as {
			id: string;
			scopes: string[];
			application: APIApplication;
			disclosures: number[];
		}[];
		const tokenInfo = res3.find((t) => t.application.id === applicationId);
		if (tokenInfo) {
			try {
				await this.client.rest.delete(`/oauth2/tokens/${tokenInfo.id}`);
				console.log(`Deauthorized application ${applicationName}`);
			} catch (err) {
				console.error(
					`Failed to deauthorize token for application ${applicationName}.`,
					(err as Error).message,
				);
			}
		}
		this.logQuestProgress(questName, 'ACHIEVEMENT_IN_ACTIVITY', questTarget, questTarget);
		console.log(`Quest "${questName}" completed!`);
		this.client.emitQuestCompleted(quest.id);
	}

	private logQuestProgress(
		questName: string,
		taskName: string,
		secondsDone: number,
		secondsNeeded: number,
	) {
		const done = Math.max(0, Math.min(Math.floor(secondsDone), secondsNeeded));
		const total = Math.max(Math.floor(secondsNeeded), 1);
		const percent = Math.min(Math.floor((done / total) * 100), 100);
		const remaining = Math.max(total - done, 0);
		console.log(
			`Quest progress: ${questName} | ${taskName} | ${done}/${total}s | ${percent}% | ${Math.ceil(remaining / 60)}m left`,
		);
	}
}
