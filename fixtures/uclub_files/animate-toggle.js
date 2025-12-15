!function(n) {
    "use strict";
    var a = {
        initialize: function() {
            this.toggler();
        },
        event: function() {},
        toggler: function() {
            n(".navbar-toggler").each(function() {
                var a = n(this);
                a.on("click", function() {
                    a.toggleClass("active");
                }), n(window).resize(function() {
                    n(".navbar-toggler").removeClass("active");
                });
            });
        }

    };
    n(document).ready(function() {
        a.initialize();
    });
}(jQuery);
