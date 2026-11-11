package com.uniti.partnerportal.common.domain;

import com.uniti.partnerportal.common.error.PortalException;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Declarative table of allowed transitions for a status enum. Each lifecycle (deal, quote,
 * order, claim, case) declares its graph once and every mutation is checked against it, so an
 * illegal jump is rejected consistently with a 409 rather than silently corrupting state.
 */
public final class StateMachine<S extends Enum<S>> {

    private final String entityName;
    private final Map<S, Set<S>> transitions;

    private StateMachine(String entityName, Map<S, Set<S>> transitions) {
        this.entityName = entityName;
        this.transitions = transitions;
    }

    public static <S extends Enum<S>> Builder<S> builder(String entityName, Class<S> type) {
        return new Builder<>(entityName, type);
    }

    public boolean canTransition(S from, S to) {
        return transitions.getOrDefault(from, Collections.emptySet()).contains(to);
    }

    public void assertTransition(S from, S to) {
        if (!canTransition(from, to)) {
            throw new PortalException.InvalidTransition(entityName, from, to);
        }
    }

    public Set<S> nextStates(S from) {
        return Collections.unmodifiableSet(transitions.getOrDefault(from, Collections.emptySet()));
    }

    public boolean isTerminal(S state) {
        return nextStates(state).isEmpty();
    }

    public static final class Builder<S extends Enum<S>> {
        private final String entityName;
        private final Class<S> type;
        private final Map<S, Set<S>> transitions;

        private Builder(String entityName, Class<S> type) {
            this.entityName = entityName;
            this.type = type;
            this.transitions = new EnumMap<>(type);
        }

        @SafeVarargs
        public final Builder<S> allow(S from, S... to) {
            Set<S> targets = transitions.computeIfAbsent(from, k -> EnumSet.noneOf(type));
            Collections.addAll(targets, to);
            return this;
        }

        public StateMachine<S> build() {
            Map<S, Set<S>> frozen = new EnumMap<>(type);
            transitions.forEach((k, v) -> frozen.put(k, Collections.unmodifiableSet(EnumSet.copyOf(v))));
            return new StateMachine<>(entityName, Collections.unmodifiableMap(frozen));
        }
    }
}
