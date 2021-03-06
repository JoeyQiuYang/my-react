export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

export function createUpdate(expirationTime){
	let update = {
		// expirationTime,
		// suspenseConfig,

		tag: UpdateState,
		payload: null,
		callback: null,

		next: null,
	};
	update.next = update;
	return update;
}

export function enqueueUpdate(fiber, update) {
	const updateQueue = fiber.updateQueue;
	if (updateQueue === null) {
		// Only occurs if the fiber has been unmounted.
		return;
	}

	const sharedQueue = updateQueue.shared;
	const pending = sharedQueue.pending;
	if (pending === null) {
		// This is the first update. Create a circular list.
		update.next = update;
	} else {
		update.next = pending.next;
		pending.next = update;
	}
	sharedQueue.pending = update;
}


function getStateFromUpdate(
	workInProgress,
	queue,
	update,
	prevState,
	nextProps,
	instance,
) {
	switch (update.tag) {
		case ReplaceState: {
			const payload = update.payload;
			if (typeof payload === 'function') {
				// Updater function

				const nextState = payload.call(instance, prevState, nextProps);

				return nextState;
			}
			// State object
			return payload;
		}
		// case CaptureUpdate: {
		// 	workInProgress.effectTag =
		// 		(workInProgress.effectTag & ~ShouldCapture) | DidCapture;
		// }
		// Intentional fallthrough
		case UpdateState: {
			const payload = update.payload;
			let partialState;
			if (typeof payload === 'function') {
				// Updater function
				partialState = payload.call(instance, prevState, nextProps);
			} else {
				// Partial state object
				partialState = payload;
			}
			if (partialState === null || partialState === undefined) {
				// Null and undefined are treated as no-ops.
				return prevState;
			}
			// Merge the partial state and the previous state.
			return Object.assign({}, prevState, partialState);
		}
		case ForceUpdate: {
			// hasForceUpdate = true;
			return prevState;
		}
	}
	return prevState;
}

export function processUpdateQueue(
	workInProgress,
	props,
	// instance: any,
	// renderExpirationTime: ExpirationTime,
){
	// This is always non-null on a ClassComponent or HostRoot
	const queue = workInProgress.updateQueue;

	// hasForceUpdate = false;

	// The last rebase update that is NOT part of the base state.
	let baseQueue = queue.baseQueue;

	// The last pending update that hasn't been processed yet.
	let pendingQueue = queue.shared.pending;
	if (pendingQueue !== null) {
		// We have new updates that haven't been processed yet.
		// We'll add them to the base queue.
		if (baseQueue !== null) {
			// Merge the pending queue and the base queue.
			let baseFirst = baseQueue.next;
			let pendingFirst = pendingQueue.next;
			baseQueue.next = pendingFirst;
			pendingQueue.next = baseFirst;
		}

		baseQueue = pendingQueue;

		queue.shared.pending = null;
		// TODO: Pass `current` as argument
		const current = workInProgress.alternate;
		if (current !== null) {
			const currentQueue = current.updateQueue;
			if (currentQueue !== null) {
				currentQueue.baseQueue = pendingQueue;
			}
		}
	}

	// These values may change as we process the queue.
	if (baseQueue !== null) {
		let first = baseQueue.next;
		// Iterate through the list of updates to compute the result.
		let newState = queue.baseState;
		// let newExpirationTime = NoWork;

		let newBaseState = null;
		let newBaseQueueFirst = null;
		let newBaseQueueLast = null;

		if (first !== null) {
			let update = first;
			do {
				const updateExpirationTime = update.expirationTime;
				// if (updateExpirationTime < renderExpirationTime) {
				// 	// Priority is insufficient. Skip this update. If this is the first
				// 	// skipped update, the previous update/state is the new base
				// 	// update/state.
				// 	const clone = {
				// 		expirationTime: update.expirationTime,
				// 		suspenseConfig: update.suspenseConfig,
				//
				// 		tag: update.tag,
				// 		payload: update.payload,
				// 		callback: update.callback,
				//
				// 		next: null,
				// 	};
				// 	if (newBaseQueueLast === null) {
				// 		newBaseQueueFirst = newBaseQueueLast = clone;
				// 		newBaseState = newState;
				// 	} else {
				// 		newBaseQueueLast = newBaseQueueLast.next = clone;
				// 	}
				// } else {
				// This update does have sufficient priority.

				if (newBaseQueueLast !== null) {
					const clone = {
						// expirationTime: Sync, // This update is going to be committed so we never want uncommit it.
						// suspenseConfig: update.suspenseConfig,

						tag: update.tag,
						payload: update.payload,
						callback: update.callback,

						next: null,
					};
					newBaseQueueLast = newBaseQueueLast.next = clone;
				}

				// Mark the event time of this update as relevant to this render pass.
				// TODO: This should ideally use the true event time of this update rather than
				// its priority which is a derived and not reverseable value.
				// TODO: We should skip this update if it was already committed but currently
				// we have no way of detecting the difference between a committed and suspended
				// update here.
				// markRenderEventTimeAndConfig(
				// 	updateExpirationTime,
				// 	update.suspenseConfig,
				// );

				// Process this update.
				newState = getStateFromUpdate(
					workInProgress,
					queue,
					update,
					newState,
					props,
					// instance,
				);
				// const callback = update.callback;
				// if (callback !== null) {
				// 	workInProgress.effectTag |= Callback;
				// 	let effects = queue.effects;
				// 	if (effects === null) {
				// 		queue.effects = [update];
				// 	} else {
				// 		effects.push(update);
				// 	}
				// }
				// }
				update = update.next;
				if (update === null || update === first) {
					pendingQueue = queue.shared.pending;
					if (pendingQueue === null) {
						break;
					} else {
						// An update was scheduled from inside a reducer. Add the new
						// pending updates to the end of the list and keep processing.
						update = baseQueue.next = pendingQueue.next;
						pendingQueue.next = first;
						queue.baseQueue = baseQueue = pendingQueue;
						queue.shared.pending = null;
					}
				}
			} while (true);
		}

		if (newBaseQueueLast === null) {
			newBaseState = newState;
		} else {
			newBaseQueueLast.next = newBaseQueueFirst;
		}

		queue.baseState = newBaseState;
		queue.baseQueue = newBaseQueueLast;

		// Set the remaining expiration time to be whatever is remaining in the queue.
		// This should be fine because the only two other things that contribute to
		// expiration time are props and context. We're already in the middle of the
		// begin phase by the time we start processing the queue, so we've already
		// dealt with the props. Context in components that specify
		// shouldComponentUpdate is tricky; but we'll have to account for
		// that regardless.
		// markUnprocessedUpdateTime(newExpirationTime);
		// workInProgress.expirationTime = newExpirationTime;
		workInProgress.memoizedState = newState;
	}
}
