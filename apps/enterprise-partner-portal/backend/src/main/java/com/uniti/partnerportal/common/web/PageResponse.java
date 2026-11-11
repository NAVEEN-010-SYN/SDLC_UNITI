package com.uniti.partnerportal.common.web;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.List;
import java.util.function.Function;

/**
 * Pagination envelope mandated by the platform API conventions:
 * {@code { items, page, pageSize, total }} with a 1-based page number on the wire.
 */
public record PageResponse<T>(List<T> items, int page, int pageSize, long total) {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements());
    }

    /**
     * Builds a {@link Pageable} from 1-based query parameters, clamping the page size so a client
     * cannot request an unbounded result set.
     */
    public static Pageable pageable(Integer page, Integer pageSize, Sort sort) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    public static Pageable pageable(Integer page, Integer pageSize) {
        return pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
