/* global UnitiAvailability */
(function () {
  'use strict';

  function text(tag, value) {
    var el = document.createElement(tag);
    el.textContent = value;
    return el;
  }

  function renderResult(container, data) {
    container.replaceChildren();
    if (!data.serviceable) {
      container.appendChild(text('p', UnitiAvailability.messages.unavailable));
      return;
    }
    var list = document.createElement('ul');
    data.plans.forEach(function (plan) {
      list.appendChild(text('li', plan.name + ' - ' + plan.speed + ' - ' + plan.price));
    });
    container.appendChild(list);
    if (data.installWindow) {
      container.appendChild(text('p', 'Earliest installation: ' + data.installWindow));
    }
  }

  function renderErrors(form, container, payload) {
    container.replaceChildren();
    var errors = (payload && payload.errors) || {};
    Object.keys(errors).forEach(function (field) {
      var input = form.querySelector('[name="' + field + '"]');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
      }
      container.appendChild(text('p', errors[field]));
    });
    if (!Object.keys(errors).length) {
      container.appendChild(text('p', (payload && payload.message) || UnitiAvailability.messages.error));
    }
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.classList || !form.classList.contains('uniti-availability')) {
      return;
    }
    event.preventDefault();
    var result = form.querySelector('.uniti-availability__result');
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    result.replaceChildren(text('p', UnitiAvailability.messages.checking));

    var body = new FormData(form);
    body.append('action', UnitiAvailability.action);
    body.append('nonce', UnitiAvailability.nonce);

    fetch(UnitiAvailability.ajaxUrl, { method: 'POST', body: body, credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (json) {
        if (json.success) {
          renderResult(result, json.data);
        } else {
          renderErrors(form, result, json.data);
        }
      })
      .catch(function () { renderErrors(form, result, null); });
  });
})();
