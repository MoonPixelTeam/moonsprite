use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
pub struct CloseCoordinator {
    next_token: AtomicU64,
    active_token: AtomicU64,
}

impl CloseCoordinator {
    pub fn begin(&self) -> Option<u64> {
        let token = self.next_token.fetch_add(1, Ordering::SeqCst) + 1;
        self.active_token
            .compare_exchange(0, token, Ordering::SeqCst, Ordering::SeqCst)
            .ok()
            .map(|_| token)
    }

    pub fn cancel(&self) {
        self.active_token.store(0, Ordering::SeqCst);
    }

    pub fn is_pending(&self) -> bool {
        self.active_token.load(Ordering::SeqCst) != 0
    }

    pub fn expire(&self, token: u64) -> bool {
        self.active_token
            .compare_exchange(token, 0, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::CloseCoordinator;

    #[test]
    fn allows_only_one_pending_close_request() {
        let coordinator = CloseCoordinator::default();
        let token = coordinator.begin().unwrap();
        assert!(coordinator.is_pending());
        assert!(coordinator.begin().is_none());
        assert!(coordinator.expire(token));
        assert!(!coordinator.is_pending());
    }

    #[test]
    fn cancel_invalidates_the_current_timeout() {
        let coordinator = CloseCoordinator::default();
        let first = coordinator.begin().unwrap();
        coordinator.cancel();
        assert!(!coordinator.is_pending());
        let second = coordinator.begin().unwrap();
        assert_ne!(first, second);
        assert!(!coordinator.expire(first));
        assert!(coordinator.expire(second));
    }
}
