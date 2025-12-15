

$(function () {
  $('[data-toggle="tooltip"]').tooltip();
});



/*
$('.owl-carousel').owlCarousel({
    loop:true,
    autoplay:true,
    autoplayTimeout:8500,
    smartSpeed: 900,
    lazyLoad: true,
    margin:0,
    nav:true,
    navText :["<i class='fa fa-angle-left'></i>","<i class='fa fa-angle-right'></i>"],
    responsive:{
        0:{
            items:1
        },
    }
});
*/



//*==OWL SLIDER HOMEPAGE HERO
//==============================
$(document).ready(function(){
  $('#hero-carousel').owlCarousel({
    stagePadding:0,
    interval: 5000,
    nav:true,
    navText :["<i class='far fa-chevron-left'></i>","<i class='far fa-chevron-right'></i>"],
    thumbs: true,
    thumbsPrerendered: true,
    //dots:true,
    //Fixes issue with cloning
    loop: true,
  //  rewind: true,
    lazyLoad: true,
    margin:0,
    autoplay:true,
    autoplayTimeout:5500,
    items:1,
    //autoplayHoverPause: true,
    //animateIn: 'fadeIn', // add this
    //animateOut: 'fadeOut', // and this
  });
});




//*==Article Slider
//==============================
$(document).ready(function(){
  $('#article-slider').owlCarousel({
    interval: 5000,
    stagePadding:10,
    nav:true,
    navText :["<i class='far fa-chevron-left'></i>","<i class='far fa-chevron-right'></i>"],
      dots:true,
    loop:false,
    margin:20,
    lazyLoad: true,
  //  autoplay:true,
  //  autoplayTimeout:4000,
  //  items:3,
    animateOut: 'fadeOut',
    responsive:{
        0:{
            items:1,
            stagePadding:40,
        },
        576:{
            items:3,
        },

      }
  });
});

// Magnific Pop - Lightbox
//==============================

$('.img-popup').magnificPopup({
   type: 'image',
   gallery: {
      enabled: true
    }
});


$('.video-popup').magnificPopup({
   type: 'iframe'
});



/* smart menu test
$(function() {
  $('#main-menu').smartmenus();
});
 */

 $(document).ready(function() {
   $('#daTable').DataTable();
} );
