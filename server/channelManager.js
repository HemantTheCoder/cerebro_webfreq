/**
 * Cerebro Channel Manager
 * Handles active frequencies and user presence.
 */

class ChannelManager {
    constructor() {
        // frequency -> { users: Set<socketId>, lastActive: Date }
        this.channels = new Map();
        // socketId -> frequency
        this.users = new Map();
    }

    joinChannel(socketId, frequency) {
        // Leave current channel first if any
        this.leaveChannel(socketId);

        if (!this.channels.has(frequency)) {
            this.channels.set(frequency, {
                users: new Set(),
                lastActive: Date.now()
            });
        }

        const channel = this.channels.get(frequency);
        channel.users.add(socketId);
        channel.lastActive = Date.now();
        this.users.set(socketId, frequency);

        return {
            frequency,
            userCount: channel.users.size
        };
    }

    leaveChannel(socketId) {
        const frequency = this.users.get(socketId);
        if (!frequency) return null;

        const channel = this.channels.get(frequency);
        if (channel) {
            channel.users.delete(socketId);
            if (channel.users.size === 0) {
                // Keep channel in memory for a bit or delete immediately?
                // For scanning purposes, we might want to know it *was* active.
                // For now, let's delete empty channels to keep 'scan' clean.
                this.channels.delete(frequency);
            }
        }
        this.users.delete(socketId);
        return frequency;
    }

    getChannelUsers(frequency) {
        const channel = this.channels.get(frequency);
        return channel ? Array.from(channel.users) : [];
    }

    getScanList() {
        const scanResults = [];
        for (const [freq, data] of this.channels.entries()) {
            scanResults.push({
                frequency: freq,
                users: data.users.size,
                lastActive: data.lastActive
            });
        }
        // Sort by users (desc) then freq
        return scanResults.sort((a, b) => b.users - a.users || a.frequency.localeCompare(b.frequency));
    }

    updateActivity(frequency) {
        if (this.channels.has(frequency)) {
            this.channels.get(frequency).lastActive = Date.now();
        }
    }
}

module.exports = new ChannelManager();
